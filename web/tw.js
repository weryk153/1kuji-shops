// 台灣全家一番賞庫存頁：data/tw-familymart.json（scraper/fetch-familymart.ts 產生）
import { loadJson, el } from './common.js';
import { createMap } from './map.js';
import { haversineKm, formatDistance } from './geo-utils.js';

const $ = (id) => document.getElementById(id);
const PAGE_SIZE = 30;
const STALE_HOURS = 24;
const TAIWAN = { center: [23.7, 120.95], zoom: 7 };
const TILES = {
  // 国土地理院的圖磚不涵蓋台灣，改用 OSM（CARTO 現在要 API key）
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  maxNativeZoom: 19,
};
// 縣市由北到南排（下拉選單用）
const CITY_ORDER = ['基隆市', '台北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '台中市', '彰化縣', '南投縣', '雲林縣',
  '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'];

const TW_FMT = new Intl.DateTimeFormat('zh-TW', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei',
});

let data = null;
let product = null;     // 目前選的品項
let shops = [];         // 目前品項有上架的店（含售完），每筆多一個 qty
let user = null;        // { lat, lon }
let sortMode = 'few';
let limit = PAGE_SIZE;
let map = null;

const picker = $('kuji-picker');
const citySelect = $('city-select');
const statusEl = $('status');
const listEl = $('shop-list');
const sortToggle = $('sort-toggle');
const mapContainer = $('map-container');

async function init() {
  try {
    data = await loadJson('data/tw-familymart.json');
  } catch {
    picker.innerHTML = '';
    picker.append(el('p', 'picker-empty', '資料還沒產生，晚點再來看看。'));
    $('source-updated').textContent = '尚無資料';
    return;
  }
  const updated = data.source_updated || data.scraped_at;
  $('source-updated').textContent = updated ? TW_FMT.format(new Date(updated)) : '不明';
  if (data.scraped_at && Date.now() - new Date(data.scraped_at).getTime() > STALE_HOURS * 3600_000) {
    $('stale-warning').hidden = false;
  }

  map = createMap({
    container: mapContainer,
    onLocate,
    center: TAIWAN.center,
    zoom: TAIWAN.zoom,
    tiles: TILES,
    minPinZoom: 0, // 一款最多幾百間店，全台都畫得下
    popupMeta: (s) => (s.qty > 0 ? `剩 ${s.qty} 籤` : null),
  });
  map.init();

  renderPicker();
  const code = new URLSearchParams(location.search).get('code');
  const initial = data.products.find((p) => p.code === code) || data.products.find((p) => p.stores > 0);
  if (initial) select(initial, { scroll: false });

  citySelect.addEventListener('change', () => {
    limit = PAGE_SIZE;
    const inCity = filtered();
    map.fitShops(citySelect.value ? inCity : shops);
    render();
  });
  sortToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.sort-opt');
    if (!btn || btn.disabled) return;
    setSort(btn.dataset.mode);
    render();
  });
  updateSortButtons();
}

function renderPicker() {
  picker.innerHTML = '';
  for (const p of data.products) {
    const btn = el('button', 'chip tw-chip');
    btn.type = 'button';
    btn.dataset.code = p.code;
    btn.setAttribute('aria-pressed', 'false');
    btn.append(el('span', 'tw-chip-name', p.short));
    btn.append(el('span', 'tw-chip-count', p.stores > 0 ? `${p.stores} 家` : '全台售完'));
    if (p.stores === 0) btn.classList.add('is-empty');
    btn.title = p.name;
    btn.addEventListener('click', () => select(p, { scroll: true }));
    picker.append(btn);
  }
}

function select(p, { scroll }) {
  product = p;
  for (const b of picker.querySelectorAll('.tw-chip')) b.setAttribute('aria-pressed', String(b.dataset.code === p.code));
  shops = data.stores
    .filter((s) => p.code in s.stock)
    .map((s) => ({ ...s, qty: s.stock[p.code], sellout_flag: s.stock[p.code] > 0 ? undefined : 1 }));
  limit = PAGE_SIZE;

  const cities = new Map();
  for (const s of shops) if (s.qty > 0) cities.set(s.city, (cities.get(s.city) || 0) + 1);
  const prev = citySelect.value;
  citySelect.innerHTML = '';
  citySelect.append(new Option(`全台（${shops.filter((s) => s.qty > 0).length} 家有貨）`, ''));
  for (const c of [...cities.keys()].sort((a, b) => cityRank(a) - cityRank(b))) {
    citySelect.append(new Option(`${c}（${cities.get(c)}）`, c));
  }
  citySelect.value = cities.has(prev) ? prev : '';
  citySelect.disabled = false;

  map.setShops(shops);
  if (!user) map.fitShops(citySelect.value ? filtered() : shops.filter((s) => s.qty > 0));

  const url = new URL(location.href);
  url.searchParams.set('code', p.code);
  history.replaceState(null, '', url);
  render();
  if (scroll) $('finder-label').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cityRank(c) {
  const i = CITY_ORDER.indexOf(c);
  return i === -1 ? 99 : i;
}

function filtered() {
  return citySelect.value ? shops.filter((s) => s.city === citySelect.value) : shops;
}

function km(s) {
  return user ? haversineKm(user.lat, user.lon, s.lat, s.lon) : null;
}

function sorted(list) {
  const soldOut = (s) => (s.qty > 0 ? 0 : 1);
  const by = {
    few: (a, b) => a.qty - b.qty,
    many: (a, b) => b.qty - a.qty,
    distance: (a, b) => km(a) - km(b),
  }[sortMode];
  return [...list].sort((a, b) => soldOut(a) - soldOut(b) || by(a, b) || a.id.localeCompare(b.id));
}

function render() {
  listEl.innerHTML = '';
  if (!product) return;
  const list = filtered();
  const inStock = list.filter((s) => s.qty > 0);
  const where = citySelect.value || '全台';
  if (inStock.length === 0) {
    statusEl.textContent = `${where}的全家目前沒有「${product.short}」`;
    sortToggle.hidden = true;
    return;
  }
  const total = inStock.reduce((n, s) => n + s.qty, 0);
  statusEl.textContent = `「${product.short}」${where} ${inStock.length} 家有貨，共剩 ${total.toLocaleString()} 籤`;
  sortToggle.hidden = false;

  const rows = sorted(list);
  const ul = el('ul', 'city-shops');
  for (const s of rows.slice(0, limit)) ul.append(renderShop(s));
  listEl.append(ul);
  if (rows.length > limit) {
    const more = el('button', 'expand-btn', `再顯示 ${Math.min(PAGE_SIZE, rows.length - limit)} 間 ▾`);
    more.type = 'button';
    more.addEventListener('click', () => { limit += PAGE_SIZE; render(); });
    listEl.append(more);
  }
}

function renderShop(s) {
  const li = el('li', 'shop-card');
  const soldOut = !(s.qty > 0);
  if (soldOut) li.classList.add('sold-out');

  const name = el('div', 'name', s.name);
  if (soldOut) name.append(el('span', 'sellout-badge', '售完'));
  else name.append(el('span', `tw-qty${s.qty <= 10 ? ' is-low' : ''}`, `剩 ${s.qty} 籤`));

  const addr = el('div', 'address', s.address);

  const actions = el('div', 'shop-actions');
  const pin = el('button', 'pin-btn', '在地圖上看');
  pin.type = 'button';
  pin.addEventListener('click', () => {
    map.focusShop(s);
    mapContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  const link = el('a', 'map-link', 'Google 地圖');
  link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name} ${s.address}`)}`;
  link.target = '_blank';
  link.rel = 'noopener';
  actions.append(pin, link);

  li.append(name, addr, actions);
  const d = km(s);
  if (d != null) li.append(el('span', 'distance', formatDistance(d)));
  return li;
}

function setSort(mode) {
  sortMode = mode;
  limit = PAGE_SIZE;
  updateSortButtons();
}

function updateSortButtons() {
  for (const b of sortToggle.querySelectorAll('.sort-opt')) {
    const on = b.dataset.mode === sortMode;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-checked', String(on));
    if (b.dataset.mode === 'distance') {
      b.disabled = !user;
      b.title = user ? '' : '先按地圖右下「◎ 我的位置」';
    }
  }
}

function onLocate({ coords, error }) {
  if (error) {
    statusEl.textContent = error === 'denied' ? '沒有取得位置權限，請在瀏覽器設定允許定位' : '暫時抓不到你的位置，稍後再試';
    return;
  }
  user = coords;
  citySelect.value = '';
  setSort('distance');
  const nearest = sorted(shops.filter((s) => s.qty > 0)).slice(0, 5).map((shop) => ({ shop, km: km(shop) }));
  map.setUser(coords, nearest);
  render();
}

init();
