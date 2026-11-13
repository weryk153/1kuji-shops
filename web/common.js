// 各頁共用：資料載入、日期格式、取扱店標籤、各賞等級配色、一番賞卡片

export async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

// schedule.json 可能還沒產生（舊部署），失敗時當作空的
export async function loadSchedule() {
  try {
    return await loadJson('data/schedule.json');
  } catch {
    return { scraped_at: null, months: [], items: [] };
  }
}

// JST 的今天 YYYY-MM-DD
export function todayJst(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// "2026-11-13" → "11/13（五）"
export function formatDay(ymd, { weekday = true } = {}) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekday ? `${m}/${d}（${WEEKDAYS[w]}）` : `${m}/${d}`;
}

// ISO（JST）→ "11/13（五）11:00"
export function formatDayTime(iso) {
  if (!iso) return '';
  const jst = new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString();
  return `${formatDay(jst.slice(0, 10))} ${jst.slice(11, 16)}`;
}

export function formatPrice(price) {
  return Number.isFinite(price) ? `${price.toLocaleString('ja-JP')}円／回` : '';
}

// 主要販售日：店頭優先，沒有店頭就用線上日
export function releaseDate(item) {
  return item.shop_date || (item.online_at ? item.online_at.slice(0, 10) : null) || item.release_date || null;
}

// 取扱店原文 → 篩選用標籤
export const STORE_TAGS = [
  { key: 'seven', label: '7-Eleven', match: /セブン/ },
  { key: 'lawson', label: 'Lawson', match: /ローソン/ },
  { key: 'famima', label: 'FamilyMart', match: /ファミリーマート|ファミマ/ },
  { key: 'ministop', label: 'Ministop', match: /ミニストップ/ },
  { key: 'books', label: '書店・玩具店', match: /書店|ホビー|玩具|アニメイト|ゲーム/ },
  { key: 'online', label: '線上', match: null },
];

export function storeTags(item) {
  const tags = [];
  const s = item.stores || '';
  for (const t of STORE_TAGS) {
    const hit = t.match ? t.match.test(s) : (!!item.online_at || /ONLINE|オンライン/.test(s));
    if (hit) tags.push(t.key);
  }
  return tags;
}

export function storeLabel(key) {
  return STORE_TAGS.find((t) => t.key === key)?.label ?? key;
}

// 各賞等級方塊配色：A〜 依序輪替，ラストワン賞固定金色
const RANK_COLORS = ['#e0242f', '#1f5fd1', '#13914b', '#f08a00', '#8a3ec9', '#d11c78', '#0e8a99', '#6b5a2e'];
export function rankStyle(rank) {
  if (/ラストワン/.test(rank)) return { bg: '#ffc21a', fg: '#1d1b26', short: 'ラスト\nワン' };
  if (/ダブルチャンス/.test(rank)) return { bg: '#1d1b26', fg: '#ffffff', short: 'W\nチャンス' };
  const m = rank.match(/^([A-Z]{1,2})賞$/);
  if (m) {
    const i = m[1].charCodeAt(0) - 65;
    return { bg: RANK_COLORS[i % RANK_COLORS.length], fg: '#ffffff', short: m[1] };
  }
  // 「缶バッジ賞」「水宮枢賞」這類自訂名稱：方塊只放前兩個字
  return { bg: '#6a6878', fg: '#ffffff', short: rank.replace(/賞$/, '').slice(0, 2) || '賞' };
}

export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

// 圖片載入前顯示底色，載入失敗也不留破圖
export function thumb(src, alt = '') {
  const wrap = el('div', 'thumb');
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = alt;
  img.addEventListener('load', () => wrap.classList.add('loaded'));
  img.addEventListener('error', () => { wrap.classList.add('loaded'); img.remove(); });
  if (src) img.src = src;
  wrap.appendChild(img);
  return wrap;
}

// 「11月13日開賣」
export function releaseLabel(ymd) {
  if (!ymd) return '發售日未定';
  const [, m, d] = ymd.split('-').map(Number);
  return `${m}月${d}日開賣`;
}

// 距今天幾天（今天 = 0）
export function daysFrom(today, ymd) {
  return Math.round((Date.parse(ymd) - Date.parse(today)) / 86400_000);
}

export function countdownLabel(today, ymd) {
  const n = daysFrom(today, ymd);
  if (n === 0) return '今天開賣';
  if (n === 1) return '明天開賣';
  if (n > 1) return `還有 ${n} 天`;
  return '';
}

// 橫幅大圖卡（首頁 PICKUP、日曆 NEXT）
// opts.pill：左上角 { text, kind }；opts.badge：右上角文字；opts.meta：標題下一行
export function pickCard(item, { pill, badge, meta, href } = {}) {
  const a = el('a', 'pick-card');
  a.href = href ?? `kuji?id=${encodeURIComponent(item.id)}`;
  if (/^https?:/.test(a.getAttribute('href'))) { a.target = '_blank'; a.rel = 'noopener'; }
  const t = thumb(item.banner_url || item.image_url, '');
  if (pill) t.append(el('span', `pill ${pill.kind || 'dark'}`, pill.text));
  if (badge) t.append(el('span', 'pill dark badge-r', badge));
  const body = el('div', 'pick-body');
  body.append(el('div', 'pick-title', item.name_ja));
  const m = meta ?? formatPrice(item.price);
  if (m) body.append(el('div', 'pick-meta', m));
  a.append(t, body);
  return a;
}

// 有框線的清單列：縮圖｜狀態＋標題＋價格｜›
export function rowCard(item, { pill } = {}) {
  const li = el('li');
  const a = el('a', 'row-card');
  a.href = `kuji?id=${encodeURIComponent(item.id)}`;
  a.append(thumb(item.image_url, ''));
  const body = el('div', 'row-body');
  if (pill) body.append(el('span', `pill ${pill.kind || ''}`, pill.text));
  body.append(el('div', 'row-title', item.name_ja));
  const price = formatPrice(item.price);
  if (price) body.append(el('div', 'row-meta', price));
  a.append(body, el('span', 'chev'));
  li.append(a);
  return li;
}

// Mercari 成交行情（data/market.json）：{ items: { kujiId: { rank: { median, n, at, query } } } }
export async function loadMarket() {
  try {
    return await loadJson('data/market.json');
  } catch {
    return { scraped_at: null, items: {} };
  }
}

export function mercariSoldUrl(query) {
  return `https://jp.mercari.com/search?keyword=${encodeURIComponent(query)}&status=sold_out`;
}

export function yen(n) {
  return `${Math.round(n).toLocaleString('ja-JP')} 円`;
}

// 「找店」「發售日曆」記住上次看的地區（日本／台灣）：導覽列直接連到那一頁
const REGION_PAGES = [
  { key: 'find-region', jp: 'shops', tw: 'tw' },
  { key: 'sched-region', jp: 'schedule', tw: 'tw-schedule' },
];
(function rememberRegion() {
  if (typeof document === 'undefined') return;
  const page = location.pathname.match(/\/([\w-]+?)(\.html)?$/)?.[1];
  try {
    for (const r of REGION_PAGES) {
      if (page === r.jp) localStorage.setItem(r.key, 'jp');
      if (page === r.tw) localStorage.setItem(r.key, 'tw');
      if (localStorage.getItem(r.key) !== 'tw') continue;
      const link = document.querySelector(`.nav-links a[href="${r.jp}"]`);
      if (link) link.setAttribute('href', r.tw);
    }
  } catch { /* 無痕模式或封鎖儲存：照預設連到日本 */ }
})();
