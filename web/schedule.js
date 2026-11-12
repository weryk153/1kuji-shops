import {
  loadJson, loadSchedule, todayJst, formatDayTime, releaseDate, countdownLabel,
  STORE_TAGS, storeTags, storeLabel, thumb, el, pickCard,
} from './common.js';

const $ = (id) => document.getElementById(id);
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

let items = [];
let months = [];
let shopIds = new Set(); // 有店舖資料（找店頁查得到）的一番賞
let month = null;        // "2026-11"
let store = 'all';

async function init() {
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

  const today = todayJst();
  const params = new URLSearchParams(location.search);
  month = months.includes(params.get('m')) ? params.get('m')
    : months.includes(today.slice(0, 7)) ? today.slice(0, 7)
    : months[0] ?? null;
  store = STORE_TAGS.some((t) => t.key === params.get('store')) ? params.get('store') : 'all';

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
  if (next.length === 0) {
    row.replaceWith(el('p', 'empty', '目前沒有已公布的發售日。'));
    return;
  }
  for (const it of next) {
    const d = releaseDate(it);
    const first = it.prizes?.[0];
    row.append(pickCard(it, {
      pill: { text: `${md(d)}（${WEEK[weekday(d)]}）`, kind: 'solid' },
      badge: countdownLabel(today, d) || null,
      meta: [it.price ? `${it.price}円／回` : '', first ? `${first.rank}：${first.name}` : ''].filter(Boolean).join('・'),
    }));
  }
}

function renderChips() {
  const box = $('store-chips');
  box.innerHTML = '';
  for (const t of [{ key: 'all', label: '全部' }, ...STORE_TAGS]) {
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
    return store === 'all' || storeTags(i).includes(store);
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
      : `這個月沒有在「${storeLabel(store)}」開賣的一番賞，切換成「全部」看看。`));
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
  link.href = `kuji?id=${encodeURIComponent(it.id)}`;
  link.append(thumb(it.banner_url || it.image_url, ''));
  const body = el('div', 'sched-body');
  body.append(el('div', 'sched-name', it.name_ja));
  if (it.price) {
    const p = el('div', 'sched-price', `${it.price}円`);
    p.append(el('span', null, '／回'));
    body.append(p);
  }
  const tags = el('div', 'tag-row');
  for (const k of storeTags(it)) tags.append(el('span', 'tag', storeLabel(k)));
  if (tags.children.length) body.append(tags);
  if (it.online_at) body.append(el('div', 'sched-online', `線上 ${formatDayTime(it.online_at)} 開始`));
  link.append(body);
  li.append(link);
  if (shopIds.has(it.id)) {
    const find = el('a', 'sched-find', '找店');
    find.href = `shops?lottery=${encodeURIComponent(it.id)}`;
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
