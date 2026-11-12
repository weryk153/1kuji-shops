import {
  loadSchedule, todayJst, releaseDate, releaseLabel, daysFrom, pickCard, rowCard, el,
} from './common.js';

const $ = (id) => document.getElementById(id);
const PICKUP_N = 5;
const ROWS_N = 4;
const SOON_N = 5;
const ON_SALE_DAYS = 30; // 開賣 30 天內算「販售中」

async function init() {
  const sched = await loadSchedule();
  const today = todayJst();
  $('scraped-at').textContent = sched.scraped_at
    ? new Date(sched.scraped_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' }) + ' JST'
    : '尚無資料';

  const dated = sched.items.filter((i) => releaseDate(i));
  const onSale = dated
    .filter((i) => releaseDate(i) <= today && daysFrom(releaseDate(i), today) <= ON_SALE_DAYS)
    .sort((a, b) => releaseDate(b).localeCompare(releaseDate(a)));
  const soon = dated.filter((i) => releaseDate(i) > today);

  // 清掉 HTML 裡的骨架佔位（避免資料載入後版面跳動）
  for (const id of ['pickup', 'onsale-rows', 'soon-rows']) $(id).innerHTML = '';
  const pickup = $('pickup');
  const picks = onSale.slice(0, PICKUP_N);
  for (const it of picks) pickup.append(pickCard(it, { pill: { text: '販售中', kind: 'dark' } }));
  if (picks.length === 0) pickup.replaceWith(el('p', 'empty', '目前沒有販售中的一番賞。'));
  setupDots(pickup, $('pickup-dots'), picks.length);

  const rows = $('onsale-rows');
  for (const it of onSale.slice(PICKUP_N, PICKUP_N + ROWS_N)) rows.append(rowCard(it, { pill: { text: '販售中' } }));

  const soonRows = $('soon-rows');
  for (const it of soon.slice(0, SOON_N)) {
    soonRows.append(rowCard(it, { pill: { text: releaseLabel(releaseDate(it)), kind: 'red' } }));
  }
  if (soon.length === 0) soonRows.replaceWith(el('p', 'empty', '還沒有公布新的發售日。'));
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
