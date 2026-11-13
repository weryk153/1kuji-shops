// 日本一番賞商品目錄（名稱、圖片、發售日），給台灣頁對照圖片用。
// 台灣賣的就是日本那幾款，通常晚幾個月到一年開賣，所以要保留比發售日曆更久的歷史。
// 每次抓最近 JP_CATALOG_MONTHS 個月（預設 3）的官網月份清單，合併進 data/jp-catalog.json（只增不減）。
//
// 用法：npm run scrape:catalog
//      JP_CATALOG_MONTHS=24 npm run scrape:catalog（第一次回補兩年）
import { readFile, writeFile } from 'node:fs/promises';
import { fetchListingHtml } from './product-page.ts';
import { parseListing } from './parse-products.ts';

const OUT = 'data/jp-catalog.json';

export interface CatalogItem { id: string; name_ja: string; image_url: string; shop_date: string | null }
export interface CatalogFile { updated_at: string; items: CatalogItem[] }

async function main() {
  const months = Number(process.env.JP_CATALOG_MONTHS || 3);
  let prev: CatalogFile = { updated_at: '', items: [] };
  try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* 第一次跑 */ }
  const byId = new Map(prev.items.map((i) => [i.id, i]));

  const now = new Date();
  let added = 0;
  for (let k = 0; k < months; k++) {
    const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
    const year = t.getUTCFullYear();
    const month = t.getUTCMonth() + 1;
    try {
      const list = parseListing(await fetchListingHtml(year, month));
      for (const it of list) {
        if (!byId.has(it.id)) added++;
        byId.set(it.id, { id: it.id, name_ja: it.name_ja, image_url: it.image_url, shop_date: it.shop_date });
      }
      console.log(`  ${year}-${month}: ${list.length} items`);
    } catch (e) {
      console.warn(`  ✗ ${year}-${month}: ${(e as Error).message}`);
    }
  }

  const items = [...byId.values()].sort((a, b) => (b.shop_date ?? '').localeCompare(a.shop_date ?? '') || a.id.localeCompare(b.id));
  await writeFile(OUT, JSON.stringify({ updated_at: now.toISOString(), items }, null, 0) + '\n');
  console.log(`jp-catalog: ${items.length} 款（新增 ${added}）→ ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
