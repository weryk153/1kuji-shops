import { loadJson, loadSchedule, loadMarket, thumb, el, formatPrice, rankStyle, mercariSoldUrl, yen } from './common.js';

const $ = (id) => document.getElementById(id);
const MIN_SHOPS = 200; // 店數太少時售完比例不穩，不列入

const MODES = [
  {
    key: 'prize',
    label: '最高行情賞',
    desc: '開賣 60 天內的一番賞，各賞在 Mercari 已售出商品的成交價中位數，由高到低。「≈ N 抽」是行情相當於抽幾次的價格。',
    prizeMode: true,
  },
  {
    key: 'soldout',
    label: '最快售完',
    desc: `販售店舖中標示「售完」的比例越高排越前面，代表越搶手。販售店少於 ${MIN_SHOPS} 間的不列入。`,
    score: (s) => s.soldout / s.shops,
    filter: (s) => s.shops >= MIN_SHOPS && s.soldout > 0,
    metric: (s) => `售完 ${(s.soldout / s.shops * 100).toFixed(1)}%`,
    detail: (s) => `${s.soldout.toLocaleString()}／${s.shops.toLocaleString()} 間`,
  },
  {
    key: 'shops',
    label: '最多店舖販售',
    desc: '販售店舖越多越好買到，適合不想排隊搶的人。',
    score: (s) => s.shops,
    filter: (s) => s.shops > 0,
    metric: (s) => `${s.shops.toLocaleString()} 間店`,
    detail: (s) => `${s.prefectures} 個都道府縣`,
  },
];

let rows = [];
let prizeRows = [];
let mode = MODES[0];

async function init() {
  const [stats, lots, sched, mk] = await Promise.all([
    loadJson('data/stats.json'),
    loadJson('data/lotteries.json').catch(() => ({ lotteries: [] })),
    loadSchedule(),
    loadMarket(),
  ]);
  for (const it of sched.items) {
    const m = mk.items[it.id];
    if (!m) continue;
    for (const p of it.prizes || []) {
      const e = m[p.rank];
      if (e?.median) prizeRows.push({ item: it, prize: p, m: e });
    }
  }
  prizeRows.sort((a, b) => b.m.median - a.m.median);
  const meta = new Map();
  for (const l of lots.lotteries) meta.set(l.id, { id: l.id, name_ja: l.name_ja, image_url: l.image_url });
  for (const i of sched.items) meta.set(i.id, { ...meta.get(i.id), ...i });
  // 只排名稱查得到的（已下檔的舊店舖檔不列入）
  rows = Object.entries(stats.lotteries)
    .filter(([id]) => meta.has(id))
    .map(([id, s]) => ({ item: meta.get(id), s }));
  const latest = Object.values(stats.lotteries).map((s) => s.scraped_at).sort().at(-1);
  const fmt = (iso) => new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
  $('scraped-at').textContent = [
    latest ? fmt(latest) : '尚無資料',
    mk.scraped_at ? `・Mercari 行情 ${fmt(mk.scraped_at)}` : '',
  ].join('');

  const want = new URLSearchParams(location.search).get('by');
  mode = MODES.find((m) => m.key === want) ?? MODES[0];
  renderTabs();
  render();
}

function renderTabs() {
  const tabs = $('rank-tabs');
  tabs.innerHTML = '';
  for (const m of MODES) {
    const b = el('button', 'tab', m.label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(m === mode));
    b.addEventListener('click', () => {
      mode = m;
      history.replaceState(null, '', `?by=${m.key}`);
      renderTabs();
      render();
    });
    tabs.append(b);
  }
}

function render() {
  $('rank-desc').textContent = mode.desc;
  const list = $('rank-list');
  list.innerHTML = '';
  if (mode.prizeMode) {
    renderPrizes(list);
    return;
  }
  const ranked = rows.filter((r) => mode.filter(r.s)).sort((a, b) => mode.score(b.s) - mode.score(a.s)).slice(0, 30);
  if (ranked.length === 0) {
    list.append(el('li', 'empty', '目前資料不足，等店舖資料更新後再來看看。'));
    return;
  }
  ranked.forEach(({ item, s }, i) => {
    const li = el('li', 'rank-row');
    const no = el('span', `rank-no${i < 3 ? ` top${i + 1}` : ''}`, String(i + 1));
    const a = el('a', 'rank-main');
    a.href = `kuji?id=${encodeURIComponent(item.id)}`;
    a.append(thumb(item.image_url, ''));
    const body = el('div', 'rank-body');
    body.append(el('div', 'row-title', item.name_ja));
    const price = formatPrice(item.price);
    body.append(el('div', 'row-meta', [mode.detail(s), price].filter(Boolean).join('・')));
    a.append(body);
    const metric = el('span', 'rank-metric', mode.metric(s));
    const find = el('a', 'sched-find', '找店');
    find.href = `shops?lottery=${encodeURIComponent(item.id)}`;
    li.append(no, a, metric, find);
    list.append(li);
  });
}

function renderPrizes(list) {
  if (prizeRows.length === 0) {
    list.append(el('li', 'empty', '還沒有行情資料，等每日更新後再來看看。'));
    return;
  }
  prizeRows.slice(0, 30).forEach(({ item, prize, m }, i) => {
    const li = el('li', 'rank-row');
    li.append(el('span', `rank-no${i < 3 ? ` top${i + 1}` : ''}`, String(i + 1)));
    const a = el('a', 'rank-main');
    a.href = `kuji?id=${encodeURIComponent(item.id)}`;
    const t = thumb(prize.image_url, '');
    t.classList.add('contain');
    a.append(t);
    const body = el('div', 'rank-body');
    const st = rankStyle(prize.rank);
    const rank = el('span', 'rank-chip', prize.rank);
    rank.style.setProperty('--rank-bg', st.bg);
    rank.style.setProperty('--rank-fg', st.fg);
    const title = el('div', 'row-title');
    title.append(rank, document.createTextNode(` ${prize.name}`));
    body.append(title, el('div', 'row-meta', item.name_ja.replace(/^一番くじ\s*/, '')));
    a.append(body);
    const metric = el('a', 'rank-metric');
    metric.href = mercariSoldUrl(m.query);
    metric.target = '_blank';
    metric.rel = 'noopener';
    metric.textContent = yen(m.median);
    if (item.price) metric.append(el('small', null, `≈ ${(m.median / item.price).toFixed(1)} 抽`));
    li.append(a, metric);
    list.append(li);
  });
}

init().catch((err) => {
  console.error(err);
  $('rank-list').append(el('li', 'empty', '資料載入失敗，請重新整理。'));
});
