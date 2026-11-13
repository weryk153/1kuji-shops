// 台灣發售資料（首頁、台灣發售日曆共用）
// - 開賣日與台幣價格：data/tw-releases.json（人工觸發讀「一番賞台灣」FB 粉專整理）
// - 沒整理到的開賣日：官方台灣清單偵測到的 released_on（沒有價格）
// - 圖片、名稱、即將開賣清單：data/tw-lineup.json（1kuji.com/areas/tw）
import { loadJson, loadSchedule } from './common.js';

// 台灣日期 YYYY-MM-DD
export function todayTw(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

export async function loadTwReleases() {
  const empty = { products: [] };
  const [rel, lineup, fm, seven, sched] = await Promise.all([
    loadJson('data/tw-releases.json'),
    loadJson('data/tw-lineup.json'),
    loadJson('data/tw-familymart.json').catch(() => empty),
    loadJson('data/tw-seven.json').catch(() => empty),
    loadSchedule(),
  ]);
  const scheduleIds = new Set(sched.items.map((i) => i.id));
  const official = new Map([...lineup.upcoming, ...lineup.released].map((i) => [i.id, i]));
  const mapped = (f) => new Set(f.products.filter((p) => p.jp_id).map((p) => p.jp_id));
  const fmIds = mapped(fm);
  const sevenIds = mapped(seven);
  const tags = (id, channels = []) => [
    'cert',
    ...(fmIds.has(id) || channels.includes('全家') ? ['famima'] : []),
    ...(sevenIds.has(id) || channels.includes('7-ELEVEN') ? ['seven'] : []),
  ];

  const items = rel.items.map((r) => ({
    id: r.id,
    name_ja: r.name_zh,
    image_url: official.get(r.id)?.image_url ?? null,
    shop_date: r.date,
    online_at: null,
    price: r.price,
    tw_tags: tags(r.id, r.channels),
  }));
  const fromFb = new Set(items.map((i) => i.id));
  for (const [id, date] of Object.entries(lineup.released_on ?? {})) {
    if (fromFb.has(id) || !official.has(id)) continue;
    const o = official.get(id);
    items.push({ id, name_ja: o.name_ja, image_url: o.image_url, shop_date: date, online_at: null, price: null, tw_tags: tags(id) });
  }
  items.sort((a, b) => a.shop_date.localeCompare(b.shop_date));
  const dated = new Set(items.map((i) => i.id));

  return {
    items,
    // 官方列為即將開賣、但還不知道日期的
    undatedUpcoming: lineup.upcoming.filter((i) => !dated.has(i.id)),
    officialIds: new Set(official.keys()),
    updated: `開賣日 ${rel.updated_at}（FB 粉專）・官方清單 ${new Date(lineup.scraped_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}`,
    // 商品詳細：本站有就連本站，沒有就連官方台灣頁
    detailHref: (id) => (scheduleIds.has(id)
      ? `kuji?id=${encodeURIComponent(id)}`
      : `https://1kuji.com/areas/tw/products/${encodeURIComponent(id)}`),
  };
}

export const twPrice = (price) => (Number.isFinite(price) ? `${price} 元／抽` : '');
