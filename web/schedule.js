import {
  loadJson, loadSchedule, todayJst, formatDayTime, releaseDate, countdownLabel,
  STORE_TAGS, storeTags, storeLabel, thumb, el, pickCard,
} from './common.js';

const $ = (id) => document.getElementById(id);
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const TW = document.body.dataset.region === 'tw';

// 台灣：開賣日與售價來自 FB 粉專整理的 data/tw-releases.json，圖片與名稱來自官方台灣清單
const TW_TAGS = [
  { key: 'cert', label: '官方認證店' },
  { key: 'famima', label: '全家' },
  { key: 'seven', label: '7-ELEVEN' },
];
const TAGS = TW ? TW_TAGS : STORE_TAGS;
const tagsOf = (it) => (TW ? it.tw_tags : storeTags(it));
const labelOf = (key) => (TW ? TW_TAGS.find((t) => t.key === key)?.label ?? key : storeLabel(key));
const priceText = (it) => (TW ? `${it.price} 元` : `${it.price}円`);
const unitText = TW ? '／抽' : '／回';
let undatedUpcoming = []; // 台灣：官方列為即將開賣、但粉專還沒公布日期的
let scheduleIds = new Set();

async function loadTw() {
  const [rel, lineup, fm, sched] = await Promise.all([
    loadJson('data/tw-releases.json'),
    loadJson('data/tw-lineup.json'),
    loadJson('data/tw-familymart.json').catch(() => ({ products: [] })),
    loadSchedule(),
  ]);
  scheduleIds = new Set(sched.items.map((i) => i.id));
  const official = new Map([...lineup.upcoming, ...lineup.released].map((i) => [i.id, i]));
  const fmIds = new Set(fm.products.filter((p) => p.jp_id).map((p) => p.jp_id));
  const list = rel.items.map((r) => ({
    id: r.id,
    name_ja: r.name_zh,
    image_url: official.get(r.id)?.image_url ?? null,
    shop_date: r.date,
    online_at: null,
    price: r.price,
    tw_tags: ['cert', ...(fmIds.has(r.id) || r.channels.includes('全家') ? ['famima'] : []), ...(r.channels.includes('7-ELEVEN') ? ['seven'] : [])],
  })).sort((a, b) => a.shop_date.localeCompare(b.shop_date));
  const dated = new Set(list.map((i) => i.id));
  undatedUpcoming = lineup.upcoming.filter((i) => !dated.has(i.id));
  const today = todayJst();
  const ms = new Set([...list.map((i) => i.shop_date.slice(0, 7)), today.slice(0, 7)]);
  return {
    items: list,
    months: [...ms].sort(),
    shopIds: new Set(official.keys()),
    updated: `開賣日 ${rel.updated_at}（FB 粉專）・官方清單 ${new Date(lineup.scraped_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}`,
  };
}

// 台灣的商品詳細：本站日曆有就連本站，沒有就連官方台灣頁
function detailHref(id) {
  if (!TW || scheduleIds.has(id)) return `kuji?id=${encodeURIComponent(id)}`;
  return `https://1kuji.com/areas/tw/products/${encodeURIComponent(id)}`;
}

let items = [];
let months = [];
let shopIds = new Set(); // 有店舖資料（找店頁查得到）的一番賞
let month = null;        // "2026-11"
let store = 'all';

async function init() {
  if (TW) {
    const tw = await loadTw();
    items = tw.items;
    months = tw.months;
    shopIds = tw.shopIds;
    $('scraped-at').textContent = tw.updated;
  } else {
    const [sched, lots] = await Promise.all([
      loadSchedule(),
      loadJson('data/lotteries.json').catch(() => ({ lotteries: [] })),
    ]);
    items = sched.items.filter((i) => releaseDate(i));
    months = sched.months;
    shopIds = new Set(lots.lotteries.map((l) => l.id));
    $('scraped-at').textContent = sched.scraped_at
      ? new Date(sched.scraped_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' }) + ' JST'
      : '尚無資料';
  }

  const today = todayJst();
  const params = new URLSearchParams(location.search);
  month = months.includes(params.get('m')) ? params.get('m')
    : months.includes(today.slice(0, 7)) ? today.slice(0, 7)
    : months[0] ?? null;
  store = TAGS.some((t) => t.key === params.get('store')) ? params.get('store') : 'all';

  renderNext(today);
  renderChips();
  render();
}

function weekday(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function md(ymd) {
  const [, m, d] = ymd.split('-').map(Number);
  return `${m}/${d}`;
}

function renderNext(today) {
  const row = $('next-row');
  const next = items.filter((i) => releaseDate(i) >= today).slice(0, 8);
  // 台灣：粉專還沒公布日期的「即將開賣」接在後面
  const undated = TW ? undatedUpcoming.slice(0, Math.max(0, 8 - next.length)) : [];
  if (next.length === 0 && undated.length === 0) {
    row.replaceWith(el('p', 'empty', '目前沒有已公布的發售日。'));
    return;
  }
  for (const it of next) {
    const d = releaseDate(it);
    const first = it.prizes?.[0];
    row.append(pickCard(it, {
      pill: { text: `${md(d)}（${WEEK[weekday(d)]}）`, kind: 'solid' },
      badge: countdownLabel(today, d) || null,
      meta: [it.price ? `${priceText(it)}${unitText}` : '', first ? `${first.rank}：${first.name}` : ''].filter(Boolean).join('・'),
      href: detailHref(it.id),
    }));
  }
  for (const it of undated) {
    row.append(pickCard(it, { pill: { text: '日期未公布', kind: 'dark' }, meta: '即將開賣', href: detailHref(it.id) }));
  }
}

function renderChips() {
  const box = $('store-chips');
  box.innerHTML = '';
  for (const t of [{ key: 'all', label: '全部' }, ...TAGS]) {
    const b = el('button', 'chip', t.label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(store === t.key));
    b.addEventListener('click', () => {
      store = t.key;
      for (const c of box.children) c.setAttribute('aria-pressed', String(c === b));
      syncUrl();
      render();
    });
    box.append(b);
  }
}

function renderTabs() {
  const tabs = $('month-tabs');
  tabs.innerHTML = '';
  const thisYear = Number(todayJst().slice(0, 4));
  for (const m of months) {
    const [y, mm] = m.split('-').map(Number);
    const b = el('button', 'tab', y === thisYear ? `${mm}月` : `${y}年${mm}月`);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(m === month));
    b.addEventListener('click', () => {
      month = m;
      syncUrl();
      render();
    });
    tabs.append(b);
  }
}

function visibleItems() {
  return items.filter((i) => {
    if (!releaseDate(i).startsWith(month)) return false;
    return store === 'all' || tagsOf(i).includes(store);
  });
}

function render() {
  renderTabs();
  const list = visibleItems();
  const byDay = new Map();
  for (const it of list) {
    const d = releaseDate(it);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(it);
  }
  if (month) {
    const [y, m] = month.split('-').map(Number);
    $('cal-title').textContent = `${y}年${m}月開賣的一番賞`;
  }
  renderCalendar(byDay);
  renderDays(byDay);
}

function renderCalendar(byDay) {
  const cal = $('calendar');
  cal.innerHTML = '';
  if (!month) return;
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = todayJst();
  WEEK.forEach((w, i) => cal.append(el('div', `cal-head${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`, w)));
  for (let i = 0; i < first; i++) cal.append(el('div', 'cal-cell'));
  for (let d = 1; d <= days; d++) {
    const ymd = `${month}-${String(d).padStart(2, '0')}`;
    const n = byDay.get(ymd)?.length ?? 0;
    const cell = el(n ? 'a' : 'div', 'cal-cell');
    if (ymd === today) cell.classList.add('today');
    cell.append(el('span', null, String(d)));
    if (n) {
      cell.href = `#d-${ymd}`;
      cell.classList.add('has');
      cell.setAttribute('aria-label', `${m}月${d}日，${n} 檔開賣`);
      const dots = el('span', 'cal-dots');
      for (let k = 0; k < Math.min(n, 3); k++) dots.append(el('i'));
      cell.append(dots);
    }
    cal.append(cell);
  }
}

function renderDays(byDay) {
  const box = $('day-list');
  box.innerHTML = '';
  if (byDay.size === 0) {
    box.append(el('p', 'empty', store === 'all'
      ? '這個月還沒有公布的發售資訊。'
      : `這個月沒有在「${labelOf(store)}」開賣的一番賞，切換成「全部」看看。`));
    return;
  }
  const today = todayJst();
  for (const [d, list] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sec = el('section', 'day');
    sec.id = `d-${d}`;
    if (d < today) sec.classList.add('past');
    const w = weekday(d);
    const h = el('h3', 'day-title', md(d));
    h.append(el('span', `wd${w === 0 ? ' sun' : w === 6 ? ' sat' : ''}`, `（${WEEK[w]}）`));
    const cd = countdownLabel(today, d);
    if (cd) h.append(el('span', 'count-down', cd));
    sec.append(h);
    const ul = el('ul', 'day-items');
    for (const it of list) ul.append(renderRow(it));
    sec.append(ul);
    box.append(sec);
  }
}

function renderRow(it) {
  const li = el('li', 'sched-row');
  const link = el('a', 'sched-main');
  link.href = detailHref(it.id);
  if (/^https?:/.test(link.href) && !link.href.startsWith(location.origin)) { link.target = '_blank'; link.rel = 'noopener'; }
  link.append(thumb(it.banner_url || it.image_url, ''));
  const body = el('div', 'sched-body');
  body.append(el('div', 'sched-name', it.name_ja));
  if (it.price) {
    const p = el('div', 'sched-price', priceText(it));
    p.append(el('span', null, unitText));
    body.append(p);
  }
  const tags = el('div', 'tag-row');
  for (const k of tagsOf(it)) tags.append(el('span', 'tag', labelOf(k)));
  if (tags.children.length) body.append(tags);
  if (it.online_at) body.append(el('div', 'sched-online', `線上 ${formatDayTime(it.online_at)} 開始`));
  link.append(body);
  li.append(link);
  if (shopIds.has(it.id)) {
    const find = el('a', 'sched-find', '找店');
    find.href = `${TW ? 'tw' : 'shops'}?lottery=${encodeURIComponent(it.id)}`;
    find.setAttribute('aria-label', `找 ${it.name_ja} 的販售店`);
    li.append(find);
  }
  return li;
}

function syncUrl() {
  const p = new URLSearchParams();
  if (month) p.set('m', month);
  if (store !== 'all') p.set('store', store);
  history.replaceState(null, '', `?${p}`);
}

init().catch((err) => {
  console.error(err);
  $('day-list').append(el('p', 'empty', '資料載入失敗，請重新整理。'));
});
