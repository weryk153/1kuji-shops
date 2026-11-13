import {
  loadSchedule, todayJst, releaseDate, releaseLabel, daysFrom, pickCard, rowCard, el, getRegion, setRegion,
} from './common.js';
import { loadTwReleases, todayTw, twPrice } from './tw-data.js';

const $ = (id) => document.getElementById(id);
const PICKUP_N = 5;
const ROWS_N = 4;
const SOON_N = 5;
const ON_SALE_DAYS = 30; // 開賣 30 天內算「販售中」

// 兩地的資料各載一次，切換分頁不重抓
const cache = {};
const REGIONS = {
  tw: {
    hero: '全家、7-ELEVEN 哪幾間有貨、各剩幾籤，<br>還有台灣開賣日與一抽多少錢。',
    find: { href: 'tw', text: '找附近有貨的店' },
    schedule: 'tw-schedule',
    async load() {
      const tw = await loadTwReleases();
      const today = todayTw();
      const onSale = tw.items
        .filter((i) => i.shop_date <= today && daysFrom(i.shop_date, today) <= ON_SALE_DAYS)
        .sort((a, b) => b.shop_date.localeCompare(a.shop_date));
      const soon = [
        ...tw.items.filter((i) => i.shop_date > today).map((it) => ({ it, label: releaseLabel(it.shop_date) })),
        ...tw.undatedUpcoming.map((it) => ({ it, label: '日期未公布' })),
      ];
      return {
        updated: tw.updated,
        onSale: onSale.map((it) => ({ it, opts: { href: tw.detailHref(it.id), meta: twPrice(it.price) } })),
        soon: soon.map(({ it, label }) => ({ it, label, opts: { href: tw.detailHref(it.id), meta: twPrice(it.price) } })),
      };
    },
  },
  jp: {
    hero: '找出你附近有賣的店、看發售日曆，<br>在店裡還能照看板算這一抽划不划算。',
    find: { href: 'shops', text: '找附近的販售店' },
    schedule: 'schedule',
    async load() {
      const sched = await loadSchedule();
      const today = todayJst();
      const dated = sched.items.filter((i) => releaseDate(i));
      const onSale = dated
        .filter((i) => releaseDate(i) <= today && daysFrom(releaseDate(i), today) <= ON_SALE_DAYS)
        .sort((a, b) => releaseDate(b).localeCompare(releaseDate(a)));
      return {
        updated: sched.scraped_at
          ? new Date(sched.scraped_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' }) + ' JST'
          : '尚無資料',
        onSale: onSale.map((it) => ({ it, opts: {} })),
        soon: dated.filter((i) => releaseDate(i) > today).map((it) => ({ it, label: releaseLabel(releaseDate(it)), opts: {} })),
      };
    },
  },
};

function bindTabs() {
  for (const b of document.querySelectorAll('.region-tabs [data-region]')) {
    b.addEventListener('click', () => {
      setRegion(b.dataset.region);
      show(b.dataset.region);
    });
  }
}

let showing = null;
async function show(region) {
  showing = region;
  const r = REGIONS[region];
  for (const b of document.querySelectorAll('.region-tabs [data-region]')) {
    b.setAttribute('aria-selected', String(b.dataset.region === region));
  }
  $('hero-text').innerHTML = r.hero;
  $('hero-find').href = r.find.href;
  $('hero-find').textContent = r.find.text;
  $('onsale-more').href = r.schedule;
  $('soon-more').href = r.schedule;

  cache[region] ??= r.load();
  const data = await cache[region];
  if (showing !== region) return; // 載入時又切走了
  render(data);
}

function render({ updated, onSale, soon }) {
  $('scraped-at').textContent = updated;
  // 清掉 HTML 裡的骨架佔位或上一個地區的內容
  for (const id of ['pickup', 'onsale-rows', 'soon-rows', 'pickup-dots']) $(id).innerHTML = '';
  for (const p of document.querySelectorAll('.empty[data-for]')) p.remove();
  const empty = (id, text) => {
    const p = el('p', 'empty', text);
    p.dataset.for = id;
    $(id).hidden = true;
    $(id).after(p);
  };
  for (const id of ['pickup', 'soon-rows']) $(id).hidden = false;

  const pickup = $('pickup');
  pickup.scrollLeft = 0;
  const picks = onSale.slice(0, PICKUP_N);
  for (const { it, opts } of picks) pickup.append(pickCard(it, { pill: { text: '販售中', kind: 'dark' }, ...opts }));
  if (picks.length === 0) empty('pickup', '目前沒有販售中的一番賞。');
  setupDots(pickup, $('pickup-dots'), picks.length);

  const rows = $('onsale-rows');
  for (const { it, opts } of onSale.slice(PICKUP_N, PICKUP_N + ROWS_N)) rows.append(rowCard(it, { pill: { text: '販售中' }, ...opts }));

  const soonRows = $('soon-rows');
  for (const { it, label, opts } of soon.slice(0, SOON_N)) {
    soonRows.append(rowCard(it, { pill: { text: label, kind: 'red' }, ...opts }));
  }
  if (soon.length === 0) empty('soon-rows', '還沒有公布新的發售日。');
}

function init() {
  bindTabs();
  return show(getRegion());
}

// 輪播下方的點：跟著橫向捲動位置亮起
function setupDots(scroller, box, n) {
  if (n < 2) return;
  const dots = [];
  for (let i = 0; i < n; i++) dots.push(box.appendChild(el('i')));
  const update = () => {
    const card = scroller.firstElementChild;
    const step = card ? card.getBoundingClientRect().width + 12 : 1;
    const idx = Math.min(n - 1, Math.round(scroller.scrollLeft / step));
    dots.forEach((d, i) => d.classList.toggle('on', i === idx));
  };
  scroller.addEventListener('scroll', update, { passive: true });
  update();
}

init().catch((err) => {
  console.error(err);
  $('pickup').replaceWith(el('p', 'empty', '資料載入失敗，請重新整理。'));
});
