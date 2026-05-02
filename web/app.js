import { generateCsv, generateFilename } from './csv.js';
import { translateShopName } from './translate.js';
import { buildSearchBlob } from './aliases.js';
import { createMap } from './map.js';

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
const downloadBtn = $('download-csv');
const filtersSection = document.querySelector('.filters');
const statusEl = $('status');
const listEl = $('shop-list');
const mapContainer = $('map-container');
const scrapedAtEl = $('scraped-at');
const staleWarning = $('stale-warning');

let lotteries = [];
let prefectures = [];
let currentShops = [];
let currentLotteryId = null;
let selectedCities = new Set();
let availableCities = []; // [{name, code, count}] for currently picked prefecture
let map = null;

async function init() {
  try {
    const [lJson, pJson] = await Promise.all([
      fetch('data/lotteries.json').then((r) => r.json()),
      fetch('data/prefectures.json').then((r) => r.json()),
    ]);
    lotteries = lJson.lotteries;
    prefectures = pJson;

    const scrapedAt = new Date(lJson.scraped_at);
    scrapedAtEl.textContent = formatDate(scrapedAt);
    if (Date.now() - scrapedAt.getTime() > 48 * 3600 * 1000) {
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
  for (const l of lotteries) {
    lotteryPicker.appendChild(renderLotteryCard(l));
  }
}

function renderLotteryCard(lottery) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'lottery-card';
  card.dataset.id = lottery.id;
  card.dataset.search = buildSearchBlob(lottery);
  card.setAttribute('role', 'radio');
  card.setAttribute('aria-checked', 'false');
  card.innerHTML = `
    <div class="img-wrap">
      <img loading="lazy" alt="" />
    </div>
    <div class="name"></div>
    <div class="date"></div>
  `;
  const imgWrap = card.querySelector('.img-wrap');
  const img = card.querySelector('img');
  img.alt = lottery.name_ja;
  img.addEventListener('load', () => imgWrap.classList.add('loaded'));
  img.addEventListener('error', () => imgWrap.classList.add('loaded'));
  if (lottery.image_url) img.src = lottery.image_url;
  card.querySelector('.name').textContent = lottery.name_ja;
  card.querySelector('.date').textContent = `${lottery.release_date} 開賣`;
  card.addEventListener('click', () => selectLottery(lottery.id));
  return card;
}

function initMap() {
  map = createMap({
    container: mapContainer,
    onPrefectureClick: (code) => {
      if (!currentLotteryId) return;
      if (prefectureSelect.value === code) {
        // 同一縣：已從全國視圖點回來，只重畫地圖即可，保留已選市区町村
        map.setPrefecture(code, availableCities);
        map.setSelectedCities(selectedCities, availableCities);
        return;
      }
      prefectureSelect.value = code;
      onPrefectureChange();
    },
    onCityToggle: (name) => {
      if (selectedCities.has(name)) selectedCities.delete(name);
      else selectedCities.add(name);
      syncCityCheckboxes();
      map.setSelectedCities(selectedCities, availableCities);
      updateUrl();
      render();
    },
  });
  map.init();
}

function syncCityCheckboxes() {
  for (const cb of cityList.querySelectorAll('input[type="checkbox"]')) {
    cb.checked = selectedCities.has(cb.value);
  }
}

function populatePrefectures() {
  prefectureSelect.innerHTML = '<option value="">選擇都道府縣…</option>';
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
  downloadBtn.addEventListener('click', onDownloadCsv);
  lotterySearchInput.addEventListener('input', onLotterySearch);
  citySearchInput.addEventListener('input', onCitySearch);
}

function onLotterySearch() {
  const q = lotterySearchInput.value.trim().toLowerCase();
  for (const card of lotteryPicker.querySelectorAll('.lottery-card')) {
    const name = (card.dataset.search || '').toLowerCase();
    card.hidden = q !== '' && !name.includes(q);
  }
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
    card.setAttribute('aria-checked', String(isSelected));
  }
}

async function selectLottery(id) {
  if (id === currentLotteryId) return;
  currentLotteryId = null;
  currentShops = [];
  markSelectedCard(id);
  prefectureSelect.disabled = false;

  try {
    statusEl.textContent = '載入店舖資料中…';
    const res = await fetch(`data/shops/${encodeURIComponent(id)}.json`);
    if (!res.ok) {
      statusEl.textContent = '找不到此一番賞，可能已下檔';
      markSelectedCard('');
      prefectureSelect.disabled = true;
      return;
    }
    const data = await res.json();
    currentShops = data.shops;
    currentLotteryId = id;
    selectedCities = new Set();
    rebuildCities();
    syncMapFromState();
    statusEl.textContent = '';
    updateUrl();
    render();
  } catch (err) {
    statusEl.textContent = '店舖資料載入失敗';
    console.error(err);
  }
}

function onPrefectureChange() {
  selectedCities = new Set();
  rebuildCities();
  syncMapFromState();
  updateUrl();
  render();
}

function syncMapFromState() {
  if (!map) return;
  const code = prefectureSelect.value || null;
  map.setPrefecture(code, availableCities);
  map.setSelectedCities(selectedCities, availableCities);
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
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
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

function updateOnboardingState() {
  if (!filtersSection) return;
  filtersSection.classList.toggle('disabled', !currentLotteryId);
}

function onCityToggle(e) {
  const v = e.target.value;
  if (e.target.checked) selectedCities.add(v);
  else selectedCities.delete(v);
  map?.setSelectedCities(selectedCities, availableCities);
  updateUrl();
  render();
}

function onCitySelectAll() {
  selectedCities = new Set(availableCities.map((c) => c.name));
  syncCityCheckboxes();
  map?.setSelectedCities(selectedCities, availableCities);
  updateUrl();
  render();
}

function onCityClear() {
  selectedCities = new Set();
  syncCityCheckboxes();
  map?.setSelectedCities(selectedCities, availableCities);
  updateUrl();
  render();
}

function render() {
  updateCitySummaryCount();
  updateOnboardingState();
  const prefCode = prefectureSelect.value;
  listEl.innerHTML = '';

  if (!currentLotteryId) {
    statusEl.textContent = '請先選一番賞';
    setActionsEnabled(false);
    return;
  }
  if (!prefCode) {
    statusEl.textContent = '請選擇都道府縣（可從上方地圖點選）';
    setActionsEnabled(false);
    return;
  }

  const inPref = currentShops.filter((s) => s.prefecture_code === prefCode);
  const pref = prefectures.find((p) => p.code === prefCode);
  const prefName = pref?.name_zh ?? '';

  if (inPref.length === 0) {
    statusEl.textContent = `${prefName} 目前沒有販售店舖`;
    setActionsEnabled(false);
    return;
  }

  if (availableCities.length > 0 && selectedCities.size === 0) {
    statusEl.textContent = `${prefName} 共 ${inPref.length} 家店舖，請勾選市区町村`;
    setActionsEnabled(false);
    return;
  }

  const filtered = availableCities.length > 0
    ? inPref.filter((s) => selectedCities.has(s.city || ''))
    : inPref;

  if (filtered.length === 0) {
    statusEl.textContent = `所選市区町村沒有店舖`;
    setActionsEnabled(false);
    return;
  }

  const cityCount = availableCities.length > 0 ? selectedCities.size : null;
  statusEl.textContent = cityCount != null
    ? `${prefName} ${cityCount} 個市区町村，共 ${filtered.length} 家店舖`
    : `${prefName} 共 ${filtered.length} 家店舖`;

  renderGrouped(filtered);
  setActionsEnabled(true);
}

function renderGrouped(shops) {
  const groups = new Map();
  for (const s of shops) {
    const key = s.city || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const keys = [...groups.keys()].sort((a, b) => a.localeCompare(b, 'ja'));
  for (const key of keys) {
    const group = document.createElement('section');
    group.className = 'city-group';
    if (key) {
      const h = document.createElement('h3');
      h.className = 'city-group-header';
      const count = groups.get(key).length;
      h.innerHTML = `<span class="title"></span><span class="count">${count} 家</span>`;
      h.querySelector('.title').textContent = key;
      group.appendChild(h);
    }
    const ul = document.createElement('ul');
    ul.className = 'city-shops';
    for (const shop of groups.get(key)) ul.appendChild(renderShop(shop));
    group.appendChild(ul);
    listEl.appendChild(group);
  }
}

function renderShop(shop) {
  const li = document.createElement('li');
  li.className = 'shop-card';
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.address)}`;
  li.innerHTML = `
    <div class="name"></div>
    <div class="address"></div>
    <div class="release"></div>
    <a class="map-link" href="${mapUrl}" target="_blank" rel="noopener" title="在 Google 地圖開啟">開啟地圖</a>
  `;
  const translated = translateShopName(shop.name);
  const nameEl = li.querySelector('.name');
  nameEl.textContent = translated;
  if (translated !== shop.name) nameEl.title = shop.name;
  li.querySelector('.address').textContent = shop.address;
  li.querySelector('.release').textContent = `開賣 ${formatDateTime(shop.release_datetime)}`;
  return li;
}

function setActionsEnabled(enabled) {
  copyBtn.disabled = !enabled;
  downloadBtn.disabled = !enabled;
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
  if (lid && lotteries.some((l) => l.id === lid)) {
    await selectLottery(lid);
  }
  if (pcode && prefectures.some((p) => p.code === pcode)) {
    prefectureSelect.value = pcode;
    selectedCities = new Set();
    rebuildCities();
    if (citiesParam) {
      const wanted = new Set(citiesParam.split(',').filter(Boolean));
      const valid = new Set(availableCities.map((c) => c.name));
      selectedCities = new Set([...wanted].filter((c) => valid.has(c)));
      syncCityCheckboxes();
    }
    syncMapFromState();
    updateUrl();
    render();
  }
}

async function onCopyLink() {
  await navigator.clipboard.writeText(window.location.href);
  copyBtn.textContent = '已複製';
  copyBtn.classList.add('success');
  setTimeout(() => {
    copyBtn.textContent = '複製分享連結';
    copyBtn.classList.remove('success');
  }, 1500);
}

function onDownloadCsv() {
  const prefCode = prefectureSelect.value;
  const lottery = lotteries.find((l) => l.id === currentLotteryId);
  const pref = prefectures.find((p) => p.code === prefCode);
  if (!lottery || !pref) return;
  const inPref = currentShops.filter((s) => s.prefecture_code === prefCode);
  const filtered = availableCities.length > 0
    ? inPref.filter((s) => selectedCities.has(s.city || ''))
    : inPref;
  if (filtered.length === 0) return;
  const csv = generateCsv(filtered);
  const sortedCities = [...selectedCities].sort((a, b) => a.localeCompare(b, 'ja'));
  const filename = generateFilename(lottery, pref, sortedCities);
  triggerDownload(csv, filename);
  flashDownloadSuccess(filtered.length);
}

function flashDownloadSuccess(n) {
  const original = downloadBtn.textContent;
  downloadBtn.textContent = `已下載 ${n} 筆 ✓`;
  downloadBtn.classList.add('success');
  setTimeout(() => {
    downloadBtn.textContent = original;
    downloadBtn.classList.remove('success');
  }, 1800);
}

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const JST_FMT = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo', hour12: false,
});
function formatDate(d) {
  return JST_FMT.format(d).replace(/\//g, '-') + ' JST';
}
function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.valueOf())) return iso;
  return formatDate(d);
}

init();
