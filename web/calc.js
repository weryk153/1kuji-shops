import { loadSchedule, loadMarket, todayJst, releaseDate, rankStyle, el, thumb, formatPrice } from './common.js';
import { computeEv } from './ev.js';

const $ = (id) => document.getElementById(id);
const yen = (n) => `${Math.round(n).toLocaleString('ja-JP')} 円`;
const signed = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString('ja-JP')} 円`;

let items = [];
let market = {};
let item = null;
// state：{ price, counts: [], values: [], target: index|null }，依一番賞 id 存在 localStorage
let state = null;

const storeKey = (id) => `calc:${id}`;
function load(id) {
  try { return JSON.parse(localStorage.getItem(storeKey(id)) || 'null'); } catch { return null; }
}
function save() {
  try { localStorage.setItem(storeKey(item.id), JSON.stringify(state)); } catch { /* 無痕模式等：不存也能用 */ }
}

const isLastOne = (p) => /ラストワン/.test(p.rank);

async function init() {
  const [sched, mk] = await Promise.all([loadSchedule(), loadMarket()]);
  market = mk.items;
  const today = todayJst();
  items = sched.items.filter((i) => i.prizes?.length);
  const onSale = items.filter((i) => releaseDate(i) <= today).sort((a, b) => releaseDate(b).localeCompare(releaseDate(a)));
  const soon = items.filter((i) => releaseDate(i) > today);

  const sel = $('kuji-select');
  for (const [label, list] of [['販售中', onSale], ['即將開賣', soon]]) {
    if (!list.length) continue;
    const g = document.createElement('optgroup');
    g.label = label;
    for (const it of list) {
      const o = document.createElement('option');
      o.value = it.id;
      o.textContent = it.name_ja.replace(/^一番くじ\s*/, '');
      g.append(o);
    }
    sel.append(g);
  }
  const want = new URLSearchParams(location.search).get('id');
  const first = items.find((i) => i.id === want) ?? onSale[0] ?? soon[0];
  if (!first) {
    $('calc-summary').append(el('p', 'empty', '目前沒有公布各賞內容的一番賞。'));
    return;
  }
  sel.value = first.id;
  sel.addEventListener('change', () => pick(sel.value));
  $('price-input').addEventListener('input', (e) => {
    state.price = e.target.value === '' ? null : Number(e.target.value);
    save();
    renderSummary();
  });
  $('calc-reset').addEventListener('click', () => {
    state = fresh();
    save();
    renderBoard();
    renderSummary();
  });
  pick(first.id);
}

function fresh() {
  return {
    price: item.price ?? null,
    counts: item.prizes.map(() => null),
    // 預設帶入 Mercari 成交中位數，使用者可以改
    values: item.prizes.map((p) => market[item.id]?.[p.rank]?.median ?? null),
    target: null,
  };
}

function pick(id) {
  item = items.find((i) => i.id === id);
  const saved = load(id);
  state = saved && saved.counts?.length === item.prizes.length ? saved : fresh();
  history.replaceState(null, '', `?id=${encodeURIComponent(id)}`);
  $('price-input').value = state.price ?? '';
  renderHero();
  renderBoard();
  renderSummary();
}

// 選定一番賞的橫幅大圖（點了到詳細頁）
function renderHero() {
  const hero = $('calc-hero');
  hero.innerHTML = '';
  hero.href = `kuji?id=${encodeURIComponent(item.id)}`;
  const t = thumb(item.banner_url || item.image_url, item.name_ja);
  const cap = el('div', 'calc-hero-cap');
  cap.append(el('b', null, item.name_ja));
  const price = formatPrice(item.price);
  cap.append(el('span', null, [price, `全 ${item.prizes.length} 賞`, '看各賞詳情 ›'].filter(Boolean).join('・')));
  hero.append(t, cap);
  hero.hidden = false;
}

function numInput(value, label, onChange) {
  const i = document.createElement('input');
  i.type = 'number';
  i.inputMode = 'numeric';
  i.min = '0';
  i.className = 'num';
  i.value = value ?? '';
  i.setAttribute('aria-label', label);
  i.addEventListener('input', () => onChange(i.value === '' ? null : Number(i.value)));
  return i;
}

function renderBoard() {
  const board = $('board');
  board.innerHTML = '';
  item.prizes.forEach((p, idx) => {
    const li = el('li', 'board-row');
    const st = rankStyle(p.rank);
    const short = st.short.split('\n')[0];
    const pic = thumb(p.image_url, `${p.rank} ${p.name}`);
    pic.classList.add('board-img');
    const tile = el('span', `mini-tile${short.length > 2 ? ' small' : ''}`, short);
    tile.style.setProperty('--rank-bg', st.bg);
    tile.style.setProperty('--rank-fg', st.fg);
    pic.append(tile);
    const name = el('div', 'board-name');
    name.append(el('b', null, p.rank || '賞'), el('span', null, p.name));

    const countBox = el('div', 'stepper');
    if (isLastOne(p)) {
      countBox.append(el('span', 'board-lastone', '最後一抽附贈'));
    } else {
      const minus = el('button', 'step-btn', '−');
      const plus = el('button', 'step-btn', '+');
      minus.type = plus.type = 'button';
      minus.setAttribute('aria-label', `${p.rank} 減一`);
      plus.setAttribute('aria-label', `${p.rank} 加一`);
      const input = numInput(state.counts[idx], `${p.rank} 剩餘數`, (v) => { state.counts[idx] = v; save(); renderSummary(); });
      const bump = (d) => {
        const v = Math.max(0, (Number(state.counts[idx]) || 0) + d);
        state.counts[idx] = v;
        input.value = v;
        save();
        renderSummary();
      };
      minus.addEventListener('click', () => bump(-1));
      plus.addEventListener('click', () => bump(1));
      countBox.append(minus, input, plus);
    }
    const value = numInput(state.values[idx], `${p.rank} 行情`, (v) => { state.values[idx] = v; save(); renderSummary(); });
    const mm = market[item.id]?.[p.rank]?.median;
    if (mm) value.title = `Mercari 成交中位數 ${mm.toLocaleString('ja-JP')} 円`;
    value.placeholder = '0';
    value.classList.add('value');

    const target = el('button', 'target-btn', '想抽');
    target.type = 'button';
    target.setAttribute('aria-pressed', String(state.target === idx));
    target.hidden = isLastOne(p);
    target.addEventListener('click', () => {
      state.target = state.target === idx ? null : idx;
      save();
      for (const b of board.querySelectorAll('.target-btn')) b.setAttribute('aria-pressed', 'false');
      target.setAttribute('aria-pressed', String(state.target === idx));
      renderSummary();
    });

    li.append(pic, name, countBox, value, target);
    board.append(li);
  });
}

function renderSummary() {
  const box = $('calc-summary');
  box.innerHTML = '';
  const prizes = [];
  const map = [];
  let lastOne = null;
  item.prizes.forEach((p, idx) => {
    if (isLastOne(p)) { lastOne = state.values[idx]; return; }
    map[idx] = prizes.length;
    prizes.push({ count: state.counts[idx], value: state.values[idx] });
  });
  const r = computeEv({ price: state.price, lastOne, prizes }, state.target != null ? map[state.target] : null);

  renderMini(r);
  if (r.remaining === 0) {
    box.append(el('p', 'calc-empty', '在下方「獎項看板」輸入各賞剩幾個，這裡就會算出每抽期望值。'));
    return;
  }
  const main = el('div', 'calc-main');
  main.append(el('span', 'calc-label', '每抽期望值'), el('strong', 'calc-ev', yen(r.evPerDraw)));
  if (r.gainPerDraw != null) {
    const good = r.gainPerDraw >= 0;
    main.append(el('span', `calc-gain ${good ? 'good' : 'bad'}`, `比一回 ${yen(state.price)} ${good ? '多' : '少'} ${yen(Math.abs(r.gainPerDraw))}`));
  }
  box.append(main);

  const grid = el('dl', 'calc-grid');
  const cell = (k, v, cls) => { const d = el('div', cls); d.append(el('dt', null, k), el('dd', null, v)); grid.append(d); };
  cell('剩餘', `${r.remaining} 抽`);
  if (r.buyAllCost != null) cell('全部買下要花', yen(r.buyAllCost));
  if (r.buyAllGain != null) cell('全部買下損益', signed(r.buyAllGain), r.buyAllGain >= 0 ? 'good' : 'bad');
  box.append(grid);

  if (r.target && state.target != null) {
    const p = item.prizes[state.target];
    const t = r.target;
    box.append(el('p', 'calc-target', t.expectedDraws == null
      ? `${p.rank} 已經沒有了。`
      : `下一抽抽到 ${p.rank} 的機率 ${(t.chance * 100).toFixed(1)}%，平均要抽 ${t.expectedDraws.toFixed(1)} 次` +
        (Number.isFinite(state.price) ? `（約 ${yen(Math.ceil(t.expectedDraws) * state.price)}）` : '') + '。'));
  }
  if (r.unpriced > 0) box.append(el('p', 'calc-note', `有 ${r.unpriced} 抽的賞還沒填行情，先以 0 円計算。`));
}

// 手機：上方結果卡捲出畫面時，在底部分頁列上方顯示一條精簡結果
const mini = el('button', 'calc-mini');
mini.type = 'button';
mini.hidden = true;
mini.addEventListener('click', () => $('calc-summary').scrollIntoView({ behavior: 'smooth', block: 'center' }));
document.body.append(mini);
let summaryVisible = true;
let lastResult = null;
new IntersectionObserver(([e]) => {
  summaryVisible = e.isIntersecting;
  renderMini(lastResult);
}).observe($('calc-summary'));

function renderMini(r) {
  lastResult = r;
  mini.innerHTML = '';
  if (!r || r.remaining === 0 || summaryVisible) {
    mini.hidden = true;
    return;
  }
  mini.append(el('span', 'calc-mini-label', `剩 ${r.remaining} 抽・每抽期望值`), el('b', null, yen(r.evPerDraw)));
  if (r.gainPerDraw != null) {
    const good = r.gainPerDraw >= 0;
    mini.append(el('span', `calc-mini-gain ${good ? 'good' : 'bad'}`, `${good ? '+' : '−'}${yen(Math.abs(r.gainPerDraw))}`));
  }
  mini.hidden = false;
}

init().catch((err) => {
  console.error(err);
  $('calc-summary').append(el('p', 'empty', '資料載入失敗，請重新整理。'));
});
