import { generateCsv, generateFilename } from './csv.js';

const $ = (id) => document.getElementById(id);
const lotteryPicker = $('lottery-picker');
const prefectureSelect = $('prefecture-select');
const copyBtn = $('copy-link');
const downloadBtn = $('download-csv');
const statusEl = $('status');
const listEl = $('shop-list');
const scrapedAtEl = $('scraped-at');
const staleWarning = $('stale-warning');

let lotteries = [];
let prefectures = [];
let currentShops = [];
let currentLotteryId = null;

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
  card.setAttribute('role', 'radio');
  card.setAttribute('aria-checked', 'false');
  card.innerHTML = `
    <div class="img-wrap">
      <img loading="lazy" alt="" />
    </div>
    <div class="name"></div>
    <div class="date"></div>
  `;
  const img = card.querySelector('img');
  if (lottery.image_url) img.src = lottery.image_url;
  img.alt = lottery.name_ja;
  card.querySelector('.name').textContent = lottery.name_ja;
  card.querySelector('.date').textContent = `${lottery.release_date} 開賣`;
  card.addEventListener('click', () => selectLottery(lottery.id));
  return card;
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
  copyBtn.addEventListener('click', onCopyLink);
  downloadBtn.addEventListener('click', onDownloadCsv);
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
    statusEl.textContent = '';
    updateUrl();
    render();
  } catch (err) {
    statusEl.textContent = '店舖資料載入失敗';
    console.error(err);
  }
}

function onPrefectureChange() {
  updateUrl();
  render();
}

function render() {
  const prefCode = prefectureSelect.value;
  listEl.innerHTML = '';

  if (!currentLotteryId) {
    statusEl.textContent = '請先選一番賞';
    setActionsEnabled(false);
    return;
  }
  if (!prefCode) {
    statusEl.textContent = '請選擇都道府縣';
    setActionsEnabled(false);
    return;
  }

  const filtered = currentShops.filter((s) => s.prefecture_code === prefCode);
  const prefName = prefectures.find((p) => p.code === prefCode)?.name_zh ?? '';

  if (filtered.length === 0) {
    statusEl.textContent = `${prefName} 目前沒有販售店舖`;
    setActionsEnabled(false);
    return;
  }

  statusEl.textContent = `${prefName} 共 ${filtered.length} 家店舖`;
  for (const shop of filtered) listEl.appendChild(renderShop(shop));
  setActionsEnabled(true);
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
  li.querySelector('.name').textContent = shop.name;
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
  const q = params.toString();
  history.replaceState(null, '', q ? `?${q}` : window.location.pathname);
}

async function restoreFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const lid = params.get('lottery');
  const pcode = params.get('prefecture');
  if (lid && lotteries.some((l) => l.id === lid)) {
    await selectLottery(lid);
  }
  if (pcode && prefectures.some((p) => p.code === pcode)) {
    prefectureSelect.value = pcode;
    onPrefectureChange();
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
  const filtered = currentShops.filter((s) => s.prefecture_code === prefCode);
  const csv = generateCsv(filtered);
  const filename = generateFilename(lottery, pref);
  triggerDownload(csv, filename);
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
