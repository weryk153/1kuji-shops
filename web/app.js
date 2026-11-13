// 找店頁（日本 /shops、台灣 /tw 共用）；兩邊的資料差異在 sources.js
import { translateShopName } from './translate.js';
import { createMap } from './map.js';
import { haversineKm, formatDistance, nearestShops } from './geo-utils.js';
import { thumb, el } from './common.js';
import { pickSource } from './sources.js';

const source = pickSource();
const L10N = source.labels;

const $ = (id) => document.getElementById(id);
const lotteryPicker = $('lottery-picker');
const lotterySearchInput = $('lottery-search');
const prefectureSelect = $('prefecture-select');
const cityField = $('city-field');
const cityList = $('city-list');
const citySearchInput = $('city-search');
const citySummaryCount = $('city-summary-count');
const citySelectAllBtn = $('city-select-all');
const cityClearBtn = $('city-clear');
const copyBtn = $('copy-link');
const filtersSection = document.querySelector('.filters');
const statusEl = $('status');
const listEl = $('shop-list');
const sortToggleEl = $('sort-toggle');
const mapContainer = $('map-container');
const scrapedAtEl = $('scraped-at');
const staleWarning = $('stale-warning');

const PAGE_SIZE = 5;
const NEARBY_PAGE = 10;

let lotteries = [];
let prefectures = [];
let currentShops = [];
let currentLotteryId = null;
let selectedCities = new Set();
let availableCities = []; // [{name, code, count}] for currently picked prefecture
let map = null;
let userLocation = null; // { lat, lon } | null
let sortMode = 'city'; // 'city' | 'distance'
let expandedCities = new Set(); // city names whose pagination is expanded
let nearbyLimit = NEARBY_PAGE; // 「附近的店」目前列出幾間

async function init() {
  try {
    const loaded = await source.load();
    lotteries = loaded.lotteries;
    prefectures = loaded.prefectures;

    scrapedAtEl.textContent = source.formatUpdated(loaded.updatedAt);
    if (Date.now() - loaded.checkedAt.getTime() > source.staleHours * 3600 * 1000) {
      staleWarning.hidden = false;
    }

    populateLotteries();
    populatePrefectures();
    initMap();
    bindEvents();
    restoreFromUrl();
  } catch (err) {
    statusEl.textContent = '資料暫時無法載入，請稍後再試';
    console.error(err);
  }
}

function populateLotteries() {
  lotteryPicker.innerHTML = '';
  if (lotteries.length === 0) {
    lotteryPicker.innerHTML = '<p class="picker-empty">目前沒有可選的一番賞</p>';
    return;
  }
  for (const [zh, en, list] of source.pickerGroups(lotteries)) {
    if (list.length === 0) continue;
    const group = el('div', 'picker-group');
    const h = el('h3', 'picker-group-title');
    h.append(el('span', 'sec-zh', zh), el('span', 'sec-en', en), el('span', 'picker-count', `${list.length}`));
    const row = el('div', 'picker-row');
    for (const l of list) row.appendChild(renderLotteryCard(l));
    group.append(h, row);
    lotteryPicker.appendChild(group);
  }
}

function renderLotteryCard(lottery) {
  const info = source.card(lottery);
  const card = el('div', 'lottery-card');
  card.dataset.id = lottery.id;
  card.dataset.search = source.searchBlob(lottery);

  const btn = el('button', 'lottery-select');
  btn.type = 'button';
  btn.setAttribute('aria-pressed', 'false');
  const t = thumb(info.image, '');
  if (!info.image && info.placeholder) {
    t.classList.add('thumb-text');
    t.appendChild(el('span', 'thumb-label', info.placeholder));
  }
  t.appendChild(el('span', `pill ${info.pill.kind}`, info.pill.text));
  btn.append(t, el('span', 'name', info.name), el('span', 'date', info.sub));
  btn.addEventListener('click', () => {
    selectLottery(lottery.id);
    // 選好後帶到地圖（選擇器很長，不捲過去看不到結果）
    document.querySelector('.finder')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  card.append(btn);
  if (info.moreHref) {
    const more = el('a', 'lottery-more', '看賞品 ›');
    more.href = info.moreHref;
    if (/^https?:/.test(info.moreHref)) {
      more.target = '_blank';
      more.rel = 'noopener';
      more.textContent = '看賞品（官網）↗';
    }
    card.append(more);
  }
  return card;
}

function initMap() {
  map = createMap({ container: mapContainer, onLocate: handleLocate, ...source.mapOptions });
  map.init();
}

const LOCATE_ERROR_MSG = {
  unsupported: '此瀏覽器不支援定位',
  denied: '已拒絕定位授權，請在瀏覽器設定開啟',
  timeout: '定位逾時，請再試一次',
  unavailable: '無法取得位置，請再試一次',
};

function handleLocate({ coords, error }) {
  if (error) {
    statusEl.textContent = LOCATE_ERROR_MSG[error] || '定位失敗';
    return;
  }
  userLocation = coords;
  nearbyLimit = NEARBY_PAGE;
  map.setUser(coords, nearestShops(currentShops, coords, 5));
  onSortModeChange('distance');
  render();
}

function syncCityCheckboxes() {
  for (const cb of cityList.querySelectorAll('input[type="checkbox"]')) {
    cb.checked = selectedCities.has(cb.value);
  }
}

function populatePrefectures() {
  prefectureSelect.innerHTML = `<option value="">${L10N.choosePref}</option>`;
  for (const p of prefectures) {
    const opt = document.createElement('option');
    opt.value = p.code;
    opt.textContent = p.name_zh;
    prefectureSelect.appendChild(opt);
  }
}

function bindEvents() {
  prefectureSelect.addEventListener('change', onPrefectureChange);
  citySelectAllBtn.addEventListener('click', onCitySelectAll);
  cityClearBtn.addEventListener('click', onCityClear);
  copyBtn.addEventListener('click', onCopyLink);
  lotterySearchInput.addEventListener('input', onLotterySearch);
  citySearchInput.addEventListener('input', onCitySearch);
  for (const btn of sortToggleEl.querySelectorAll('.sort-opt')) {
    btn.addEventListener('click', () => onSortModeChange(btn.dataset.mode));
  }
}

function onSortModeChange(mode) {
  if (mode === sortMode) return;
  if (mode === 'distance' && !userLocation) return;
  sortMode = mode;
  for (const btn of sortToggleEl.querySelectorAll('.sort-opt')) {
    const on = btn.dataset.mode === mode;
    btn.classList.toggle('selected', on);
    btn.setAttribute('aria-checked', String(on));
  }
  render();
}

function onLotterySearch() {
  const q = lotterySearchInput.value.trim().toLowerCase();
  let any = false;
  for (const group of lotteryPicker.querySelectorAll('.picker-group')) {
    let visible = 0;
    for (const card of group.querySelectorAll('.lottery-card')) {
      const name = (card.dataset.search || '').toLowerCase();
      card.hidden = q !== '' && !name.includes(q);
      if (!card.hidden) visible++;
    }
    group.hidden = visible === 0;
    if (visible > 0) any = true;
  }
  $('picker-no-match').hidden = any;
}

function onCitySearch() {
  const q = citySearchInput.value.trim().toLowerCase();
  for (const row of cityList.querySelectorAll('.city-row')) {
    const name = (row.dataset.search || '').toLowerCase();
    row.hidden = q !== '' && !name.includes(q);
  }
}

function markSelectedCard(id) {
  for (const card of lotteryPicker.querySelectorAll('.lottery-card')) {
    const isSelected = card.dataset.id === id;
    card.classList.toggle('selected', isSelected);
    card.querySelector('.lottery-select')?.setAttribute('aria-pressed', String(isSelected));
  }
}

// pendingLotteryId 是「目前正在 fetch 的 id」token；新一輪 selectLottery 進來
// 會把它推進，讓上一輪 fetch 即使後完成也認得自己過期，不要覆蓋現狀。
let pendingLotteryId = null;
async function selectLottery(id, opts = {}) {
  if (id === currentLotteryId && !opts.force) return;
  if (id === pendingLotteryId) return; // 同 id 已在 fetch 中，避免重複 request
  pendingLotteryId = id;
  currentLotteryId = null;
  currentShops = [];
  markSelectedCard(id);
  prefectureSelect.disabled = false;

  try {
    statusEl.textContent = '載入店舖資料中…';
    const shops = await source.loadShops(id, lotteries.find((l) => l.id === id));
    // 過期 fetch — 使用者已切到別的 id，不要覆蓋
    if (pendingLotteryId !== id) return;
    if (!shops) {
      statusEl.textContent = '找不到此一番賞，可能已下檔';
      markSelectedCard('');
      prefectureSelect.disabled = true;
      map?.setShops(null);
      return;
    }
    currentShops = shops;
    currentLotteryId = id;
    nearbyLimit = NEARBY_PAGE;
    map?.setShops(currentShops);
    if (!opts.skipReset) {
      selectedCities = new Set();
      rebuildCities();
      syncMapFromState();
      statusEl.textContent = '';
      updateUrl();
      render();
    }
  } catch (err) {
    if (pendingLotteryId !== id) return;
    statusEl.textContent = '店舖資料載入失敗';
    console.error(err);
  }
}

function onPrefectureChange() {
  selectedCities = new Set();
  expandedCities = new Set();
  rebuildCities();
  syncMapFromState();
  updateUrl();
  render();
}

// 選了都道府縣 / 市区町村 → 地圖移到那些店的範圍
function syncMapFromState() {
  if (!map) return;
  const prefCode = prefectureSelect.value;
  if (!prefCode || !currentLotteryId) return;
  const inPref = currentShops.filter((s) => s.prefecture_code === prefCode);
  const picked = selectedCities.size > 0
    ? inPref.filter((s) => selectedCities.has(s.city || ''))
    : inPref;
  map.fitShops(picked);
}

function rebuildCities() {
  const prefCode = prefectureSelect.value;
  cityList.innerHTML = '';
  availableCities = [];
  if (!prefCode || !currentLotteryId) {
    cityField.hidden = true;
    return;
  }
  const byName = new Map();
  for (const s of currentShops) {
    if (s.prefecture_code !== prefCode) continue;
    const name = s.city || '';
    if (!byName.has(name)) byName.set(name, { name, code: s.city_code || '', count: 0 });
    byName.get(name).count += 1;
  }
  availableCities = [...byName.values()]
    .sort((a, b) => a.name.localeCompare(b.name, L10N.locale));
  if (availableCities.length === 0) {
    cityField.hidden = true;
    return;
  }
  cityField.hidden = false;
  for (const c of availableCities) {
    const row = document.createElement('label');
    row.className = 'city-row';
    row.dataset.search = c.name;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = c.name;
    cb.checked = selectedCities.has(c.name);
    cb.addEventListener('change', onCityToggle);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = c.name || '（未分類）';
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = c.count;
    row.append(cb, name, count);
    cityList.appendChild(row);
  }
  // 重置搜尋框（換 prefecture 後舊關鍵字無意義）
  if (citySearchInput) citySearchInput.value = '';
  updateCitySummaryCount();
}

function updateCitySummaryCount() {
  if (!citySummaryCount) return;
  const total = availableCities.length;
  const sel = selectedCities.size;
  if (total === 0) { citySummaryCount.textContent = ''; return; }
  citySummaryCount.textContent = sel === 0
    ? `（${total} 個・未選）`
    : `（已選 ${sel}/${total}）`;
}

function onCityToggle(e) {
  const v = e.target.value;
  if (e.target.checked) selectedCities.add(v);
  else selectedCities.delete(v);
  expandedCities.delete(v);
  syncMapFromState();
  updateUrl();
  render();
}

function onCitySelectAll() {
  selectedCities = new Set(availableCities.map((c) => c.name));
  expandedCities = new Set();
  syncCityCheckboxes();
  syncMapFromState();
  updateUrl();
  render();
}

function onCityClear() {
  selectedCities = new Set();
  expandedCities = new Set();
  syncCityCheckboxes();
  syncMapFromState();
  updateUrl();
  render();
}

function render() {
  updateCitySummaryCount();
  if (filtersSection) filtersSection.classList.toggle('disabled', !currentLotteryId);
  listEl.innerHTML = '';
  sortToggleEl.hidden = true;

  if (!currentLotteryId) {
    statusEl.textContent = userLocation ? '已取得位置，請先選一番賞' : '請先選一番賞';
    setActionsEnabled();
    return;
  }

  // 這款沒有任何店舖資料（台灣：還沒開賣、或全家沒賣）
  if (currentShops.length === 0 && source.noShopsStatus) {
    statusEl.textContent = source.noShopsStatus(lotteries.find((l) => l.id === currentLotteryId));
    setActionsEnabled();
    return;
  }

  const area = resolveArea();
  if (area.shops) {
    statusEl.textContent = area.status;
    // 有定位才顯示排序切換（沒定位時依距離無從計算）
    sortToggleEl.hidden = !userLocation;
    if (sortMode === 'distance' && userLocation) renderByDistance(area.shops);
    else renderGrouped(area.shops, area.groupBy);
    setActionsEnabled();
    return;
  }
  setActionsEnabled();
  // 地區沒選完整、但有定位 → 列出附近的店
  if (userLocation) {
    renderNearby();
    return;
  }
  statusEl.textContent = area.status;
}

// 依都道府縣 / 市区町村篩選；選完整回傳 { status, shops }，否則只有 { status }（提示下一步）
// 台灣（source.listWithoutArea）店少，不必先選地區：沒選縣市就列全台、沒勾區就列整個縣市
function resolveArea() {
  const prefCode = prefectureSelect.value;
  const listAll = !!source.listWithoutArea;
  const inStock = (list) => list.filter((s) => s.sellout_flag !== 1).length;
  if (!prefCode) {
    if (listAll) {
      return { status: `全台 ${inStock(currentShops)} 家有貨，選${L10N.pref}可以縮小範圍`, shops: currentShops, groupBy: 'prefecture' };
    }
    return { status: `按地圖右下「◎ 我的位置」看附近的店，或選擇${L10N.pref}` };
  }
  const inPref = currentShops.filter((s) => s.prefecture_code === prefCode);
  const prefName = prefectures.find((p) => p.code === prefCode)?.name_zh ?? '';
  if (inPref.length === 0) return { status: `${prefName} 目前沒有販售店舖` };
  if (availableCities.length > 0 && selectedCities.size === 0) {
    if (listAll) return { status: `${prefName} ${inStock(inPref)} 家有貨`, shops: inPref };
    return { status: `${prefName} 共 ${inPref.length} 家店舖，請勾選${L10N.city}` };
  }
  const filtered = availableCities.length > 0
    ? inPref.filter((s) => selectedCities.has(s.city || ''))
    : inPref;
  if (filtered.length === 0) return { status: `所選${L10N.city}沒有店舖` };
  const status = availableCities.length > 0
    ? `${prefName} ${selectedCities.size} 個${L10N.city}，共 ${filtered.length} 家店舖`
    : `${prefName} 共 ${filtered.length} 家店舖`;
  return { status, shops: filtered };
}

function renderNearby() {
  const rows = nearestShops(currentShops, userLocation, nearbyLimit);
  if (rows.length === 0) {
    statusEl.textContent = '這個一番賞沒有店舖座標資料';
    return;
  }
  statusEl.textContent = rows[0].km > 50
    ? '你附近 50 km 內沒有販售店舖，以下是最近的店'
    : '你附近的販售店舖（由近到遠）';
  const ul = document.createElement('ul');
  ul.className = 'city-shops';
  for (const { shop, km } of rows) ul.appendChild(renderShop(shop, km));
  listEl.appendChild(ul);
  const total = currentShops.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon)).length;
  if (total > rows.length) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'expand-btn';
    more.textContent = `再顯示 ${Math.min(NEARBY_PAGE, total - rows.length)} 間 ▾`;
    more.addEventListener('click', () => {
      nearbyLimit += NEARBY_PAGE;
      render();
    });
    listEl.appendChild(more);
  }
}

function withDistance(shop) {
  if (!userLocation) return null;
  if (!Number.isFinite(shop.lat) || !Number.isFinite(shop.lon)) return null;
  return haversineKm(userLocation.lat, userLocation.lon, shop.lat, shop.lon);
}

function soldOutLast(a, b) {
  return (a.sellout_flag === 1 ? 1 : 0) - (b.sellout_flag === 1 ? 1 : 0);
}

function renderGrouped(shops, groupBy = 'city') {
  const groups = new Map();
  for (const s of shops) {
    const key = (groupBy === 'prefecture' ? s.prefecture_code : s.city) || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  // 售完店排到每組最後（pagination 預設藏在「展開更多」裡）
  for (const arr of groups.values()) arr.sort((a, b) => soldOutLast(a, b) || source.compareInGroup(a, b));
  // 依縣市分組時照縣市清單的順序（北到南），否則依名稱
  const prefOrder = new Map(prefectures.map((p, i) => [p.code, i]));
  const keys = [...groups.keys()].sort((a, b) => (groupBy === 'prefecture'
    ? (prefOrder.get(a) ?? 99) - (prefOrder.get(b) ?? 99)
    : a.localeCompare(b, L10N.locale)));
  for (const key of keys) {
    const group = document.createElement('section');
    group.className = 'city-group';
    const items = groups.get(key);
    if (key) {
      const h = document.createElement('h3');
      h.className = 'city-group-header';
      const titleSpan = document.createElement('span');
      titleSpan.className = 'title';
      titleSpan.textContent = key;
      const countSpan = document.createElement('span');
      countSpan.className = 'count';
      countSpan.textContent = `${items.length} 家`;
      h.append(titleSpan, countSpan);
      group.appendChild(h);
    }
    const ul = document.createElement('ul');
    ul.className = 'city-shops';
    const expanded = expandedCities.has(key);
    const visible = expanded ? items : items.slice(0, PAGE_SIZE);
    for (const shop of visible) ul.appendChild(renderShop(shop));
    group.appendChild(ul);
    if (items.length > PAGE_SIZE) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'expand-btn';
      if (expanded) {
        more.textContent = '收合';
      } else {
        more.textContent = `還有 ${items.length - PAGE_SIZE} 家 ▾`;
      }
      more.addEventListener('click', () => {
        if (expandedCities.has(key)) expandedCities.delete(key);
        else expandedCities.add(key);
        render();
      });
      group.appendChild(more);
    }
    listEl.appendChild(group);
  }
}

function renderByDistance(shops) {
  const withDist = shops
    .map((s) => ({ s, d: withDistance(s) }))
    .filter((x) => x.d != null)
    .sort((a, b) => {
      const diff = soldOutLast(a.s, b.s);
      return diff !== 0 ? diff : a.d - b.d;
    });
  const noDist = shops.length - withDist.length;
  const ul = document.createElement('ul');
  ul.className = 'city-shops';
  for (const { s, d } of withDist) ul.appendChild(renderShop(s, d));
  listEl.appendChild(ul);
  if (noDist > 0) {
    const note = document.createElement('p');
    note.className = 'distance-note';
    note.textContent = `${noDist} 家無座標資料、未列入距離排序`;
    listEl.appendChild(note);
  }
}

function renderShop(shop, precomputedKm) {
  const li = document.createElement('li');
  li.className = 'shop-card';
  const soldOut = shop.sellout_flag === 1;
  if (soldOut) li.classList.add('sold-out');

  const translated = translateShopName(shop.name);
  const nameEl = document.createElement('div');
  nameEl.className = 'name';
  nameEl.textContent = translated;
  if (translated !== shop.name) nameEl.title = shop.name;
  if (soldOut) {
    const badge = document.createElement('span');
    badge.className = 'sellout-badge';
    badge.textContent = '售完';
    nameEl.appendChild(badge);
  }
  const extra = source.shopBadge(shop);
  if (extra) nameEl.appendChild(el('span', `qty-badge${extra.low ? ' is-low' : ''}`, extra.text));

  const addrEl = document.createElement('div');
  addrEl.className = 'address';
  addrEl.textContent = shop.address;

  const relEl = document.createElement('div');
  relEl.className = 'release';
  relEl.textContent = source.shopLine(shop);

  // shop.address 是 1kuji.com 拉的第三方資料 — 用 setAttribute('href', ...)
  // 而非 innerHTML 模板，避免奇怪字元造成 attribute escape 問題
  const link = document.createElement('a');
  link.className = 'map-link';
  link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(source.mapsQuery(shop))}`;
  link.target = '_blank';
  link.rel = 'noopener';
  link.title = '在 Google 地圖開啟';
  link.textContent = 'Google 地圖';

  const actions = document.createElement('div');
  actions.className = 'shop-actions';
  if (Number.isFinite(shop.lat) && Number.isFinite(shop.lon)) {
    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.className = 'pin-btn';
    pinBtn.textContent = '在地圖上看';
    pinBtn.addEventListener('click', () => {
      map?.focusShop(shop);
      mapContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    actions.appendChild(pinBtn);
  }
  actions.appendChild(link);

  li.append(nameEl, addrEl, ...(relEl.textContent ? [relEl] : []), actions);

  const km = precomputedKm != null ? precomputedKm : withDistance(shop);
  if (km != null) {
    const dist = document.createElement('span');
    dist.className = 'distance';
    dist.textContent = formatDistance(km);
    li.appendChild(dist);
  }
  return li;
}

// 分享連結：選了一番賞就能分享（網址會帶上目前的地區篩選）
function setActionsEnabled() {
  copyBtn.disabled = !currentLotteryId;
}

function updateUrl() {
  const params = new URLSearchParams();
  if (currentLotteryId) params.set('lottery', currentLotteryId);
  if (prefectureSelect.value) params.set('prefecture', prefectureSelect.value);
  if (selectedCities.size > 0) params.set('cities', [...selectedCities].join(','));
  const q = params.toString();
  history.replaceState(null, '', q ? `?${q}` : window.location.pathname);
}

async function restoreFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const lid = params.get('lottery');
  const pcode = params.get('prefecture');
  const citiesParam = params.get('cities');
  const validLottery = lid && lotteries.some((l) => l.id === lid);
  const validPref = pcode && prefectures.some((p) => p.code === pcode);

  // 沒 URL state 就只跑空 render（不 await selectLottery 再跑一次）
  if (!validLottery) {
    render();
    return;
  }

  // 跳過 selectLottery 內部的 reset+render，由我們最後統一 render 一次避免閃爍
  await selectLottery(lid, { skipReset: true });
  // selectLottery 完成或被取代都會走到這 — 但 currentLotteryId 只在成功時被設
  if (currentLotteryId !== lid) return;

  if (validPref) {
    prefectureSelect.value = pcode;
    rebuildCities();
    if (citiesParam) {
      const wanted = new Set(citiesParam.split(',').filter(Boolean));
      const valid = new Set(availableCities.map((c) => c.name));
      selectedCities = new Set([...wanted].filter((c) => valid.has(c)));
      syncCityCheckboxes();
    }
  }
  syncMapFromState();
  updateUrl();
  render();
}

async function onCopyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    copyBtn.textContent = '已複製';
    copyBtn.classList.add('success');
  } catch {
    // Safari / non-HTTPS / 沒 user gesture 都可能 reject — 用 textarea fallback
    const ta = document.createElement('textarea');
    ta.value = window.location.href;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    copyBtn.textContent = ok ? '已複製' : '複製失敗';
    if (ok) copyBtn.classList.add('success');
  }
  setTimeout(() => {
    copyBtn.textContent = '複製分享連結';
    copyBtn.classList.remove('success');
  }, 1500);
}

init();
