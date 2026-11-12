import {
  loadJson, loadSchedule, todayJst, formatDay, formatDayTime, formatPrice, releaseDate,
  storeTags, storeLabel, rankStyle, thumb, el, releaseLabel, loadMarket, mercariSoldUrl, yen,
} from './common.js';

let market = {};

const root = document.getElementById('kuji');

async function init() {
  const id = new URLSearchParams(location.search).get('id');
  const [sched, lots, mk] = await Promise.all([
    loadSchedule(),
    loadJson('data/lotteries.json').catch(() => ({ lotteries: [] })),
    loadMarket(),
  ]);
  market = mk.items[id] || {};
  const lottery = lots.lotteries.find((l) => l.id === id);
  // 日曆資料優先（有價格、各賞），沒有就退回店舖查詢用的基本資料
  const item = sched.items.find((i) => i.id === id)
    ?? (lottery && { id, name_ja: lottery.name_ja, image_url: lottery.image_url, shop_date: lottery.release_date });
  root.innerHTML = '';
  if (!item) {
    root.append(el('p', 'empty', '找不到這個一番賞，可能已經下檔。'));
    const back = el('a', 'btn btn-secondary', '回發售日曆');
    back.href = 'schedule';
    back.classList.add('btn-lg');
    root.append(back);
    return;
  }
  document.title = `${item.name_ja}｜一番賞`;
  document.getElementById('crumb-name').textContent = item.name_ja;
  render(item, !!lottery);
}

function render(it, hasShops) {
  const today = todayJst();
  const d = releaseDate(it);

  const banner = thumb(it.banner_url || it.image_url, it.name_ja);
  banner.classList.add('kuji-banner');
  root.append(banner);

  const head = el('header', 'kuji-head');
  const onSale = d && d <= today;
  head.append(el('span', `pill ${onSale ? 'solid' : 'red'}`, onSale ? '販售中' : d ? releaseLabel(d) : '發售日未定'));
  head.append(el('h1', 'kuji-title', it.name_ja));

  const facts = el('dl', 'facts');
  const fact = (k, v, cls) => {
    if (!v) return;
    const dd = el('dd', cls, v);
    facts.append(el('dt', null, k), dd);
  };
  fact('單抽價格', formatPrice(it.price), 'big');
  fact('店頭發售', it.shop_date ? formatDay(it.shop_date) : '');
  fact('線上發售', it.online_at ? formatDayTime(it.online_at) : '');
  fact('取扱店', it.stores || '');
  const priced = (it.prizes || []).map((p) => market[p.rank]?.median).filter(Number.isFinite);
  if (priced.length) fact('最高行情', `${yen(Math.max(...priced))}（Mercari 成交中位數）`);
  head.append(facts);

  const tags = el('div', 'tag-row');
  for (const k of storeTags(it)) tags.append(el('span', 'tag', storeLabel(k)));
  if (tags.children.length) head.append(tags);

  const actions = el('div', 'kuji-actions');
  if (hasShops) {
    const find = el('a', 'btn btn-primary btn-lg', '找販售店舖');
    find.href = `shops?lottery=${encodeURIComponent(it.id)}`;
    actions.append(find);
  }
  if (it.prizes?.length) {
    const calc = el('a', 'btn btn-secondary btn-lg', '計算期望值');
    calc.href = `calc?id=${encodeURIComponent(it.id)}`;
    actions.append(calc);
  }
  const official = el('a', 'btn btn-secondary btn-lg', '官方商品頁');
  official.href = `https://1kuji.com/products/${encodeURIComponent(it.id)}`;
  official.target = '_blank';
  official.rel = 'noopener';
  actions.append(official);
  if (!hasShops) actions.append(el('p', 'kuji-note', '店舖清單通常在開賣前兩週公布，公布後這裡會出現「找販售店舖」。'));
  head.append(actions);
  root.append(head);

  const prizes = it.prizes || [];
  const sec = el('section', 'prizes');
  const sh = el('div', 'sec-head');
  const t = el('div');
  t.append(el('h2', null, prizes.length ? `各賞一覽（${prizes.length}）` : '各賞一覽'), el('p', 'sec-en', 'PRIZES'));
  sh.append(t);
  sec.append(sh);
  if (prizes.length === 0) {
    sec.append(el('p', 'empty', '官方還沒公布各賞內容。'));
  } else {
    const grid = el('ol', 'prize-grid');
    for (const p of prizes) grid.append(renderPrize(p, it.price));
    sec.append(grid);
    const at = Object.values(market).map((m) => m.at).sort().at(-1);
    if (at) sec.append(el('p', 'calc-note', `行情為 Mercari 已售出商品的成交價中位數（${new Date(at).toLocaleDateString('ja-JP')} 取得），排除セット與多賞同捆，僅供參考。`));
  }
  root.append(sec);
}

function renderPrize(p, drawPrice) {
  const li = el('li', 'prize');
  const st = rankStyle(p.rank);
  const tile = el('div', 'rank-tile');
  tile.style.setProperty('--rank-bg', st.bg);
  tile.style.setProperty('--rank-fg', st.fg);
  tile.textContent = st.short;
  if (st.short.length > 2 || st.short.includes('\n')) tile.classList.add('long');
  tile.setAttribute('aria-hidden', 'true');

  const pic = thumb(p.image_url, `${p.rank} ${p.name}`);
  pic.classList.add('prize-img');
  pic.append(tile);

  const body = el('div', 'prize-body');
  body.append(el('div', 'prize-rank', p.rank || '賞品'), el('div', 'prize-name', p.name));
  const meta = [];
  if (p.kinds) meta.push(`全 ${p.kinds} 種`);
  if (p.size) meta.push(p.size);
  if (meta.length) body.append(el('div', 'prize-meta', meta.join('，')));
  const m = market[p.rank];
  if (m?.median) {
    const a = el('a', 'prize-market');
    a.href = mercariSoldUrl(m.query);
    a.target = '_blank';
    a.rel = 'noopener';
    a.append(el('span', null, 'Mercari'), el('b', null, yen(m.median)));
    if (Number.isFinite(drawPrice) && drawPrice > 0) a.append(el('small', null, `≈ ${(m.median / drawPrice).toFixed(1)} 抽`));
    body.append(a);
  }
  li.append(pic, body);
  return li;
}

init().catch((err) => {
  console.error(err);
  root.innerHTML = '';
  root.append(el('p', 'empty', '資料載入失敗，請重新整理。'));
});
