// Mercari 成交行情：用無頭瀏覽器開「売り切れ」搜尋頁（robots.txt 允許的 /search，
// 不直接打 /v1 /v2 API），讀縮圖上的標題與價格，過濾成單品後取中位數。
// 輸出 data/market.json，與上一次結果合併（這次失敗的賞保留舊值）。
//
// 用法：npm run scrape:market            （開賣 60 天內的一番賞）
//      MARKET_LIMIT=2 npm run scrape:market（只跑前 2 檔，測試用）
//      MARKET_IDS=gundam_ucsi npm run scrape:market（只跑指定的）
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { searchQuery, summarize } from './market.ts';
import type { ScheduleFile } from './types.ts';

const DATA = 'data';
const WINDOW_DAYS = 60;
const GAP_MS = 2500; // 每次搜尋間隔，別給對方壓力
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface MarketEntry { median: number | null; n: number; at: string; query: string }
export interface MarketFile {
  scraped_at: string;
  items: Record<string, Record<string, MarketEntry>>; // kujiId → rank → entry
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function releaseDate(i: { shop_date: string | null; online_at: string | null }) {
  return i.shop_date ?? i.online_at?.slice(0, 10) ?? null;
}

// Mercari 依連線 IP 的國家換算幣別（台灣顯示 NT$、GitHub Actions 會是 US$），
// 每次搜尋前把 country_code 蓋成 JP，並只採用 ¥ 開頭的價格
async function forceJpy(page: Page) {
  await page.context().addCookies([
    { name: 'country_code', value: 'JP', domain: 'jp.mercari.com', path: '/', secure: true },
    { name: 'country_code', value: 'JP', domain: '.mercari.com', path: '/' },
  ]);
}

async function searchSold(page: Page, query: string) {
  await forceJpy(page);
  const url = `https://jp.mercari.com/search?keyword=${encodeURIComponent(query)}&status=sold_out&sort=created_time&order=desc`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // 沒結果時不會出現 item-cell，等不到就當 0 筆
  await page.waitForSelector('[data-testid="item-cell"] [data-testid="item-tile-price"]', { timeout: 12000 }).catch(() => null);
  return page.$$eval('[data-testid="item-cell"]', (cells) => cells.map((c) => ({
    title: (c.querySelector('img')?.getAttribute('alt') ?? '').replace(/のサムネイル.*$/, ''),
    priceText: (c.querySelector('[data-testid="item-tile-price"]')?.textContent ?? '').trim(),
  })))
    .then((rows) => {
      const other = rows.find((r) => r.priceText && !r.priceText.startsWith('¥'));
      if (other) throw new Error(`currency is not JPY: ${other.priceText}`);
      return rows
        .map((r) => ({ title: r.title, price: Number(r.priceText.replace(/[^\d]/g, '')) }))
        .filter((x) => x.title && x.price > 0);
    });
}

async function main() {
  const now = new Date();
  const today = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const since = new Date(now.getTime() + 9 * 3600_000 - WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);
  const schedule = JSON.parse(await readFile(`${DATA}/schedule.json`, 'utf8')) as ScheduleFile;
  let prev: MarketFile = { scraped_at: '', items: {} };
  try { prev = JSON.parse(await readFile(`${DATA}/market.json`, 'utf8')); } catch { /* 第一次跑 */ }

  let targets = schedule.items.filter((i) => {
    const d = releaseDate(i);
    return d && d <= today && d >= since && i.prizes?.length;
  });
  const ids = process.env.MARKET_IDS?.split(',').filter(Boolean);
  if (ids?.length) targets = targets.filter((t) => ids.includes(t.id));
  const limit = Number(process.env.MARKET_LIMIT || 0);
  if (limit > 0) targets = targets.slice(0, limit);
  console.log(`market: ${targets.length} kuji`);

  const out: MarketFile = { scraped_at: now.toISOString(), items: {} };
  // 窗內的舊資料先帶過來，窗外的自然淘汰
  for (const t of targets) if (prev.items[t.id]) out.items[t.id] = { ...prev.items[t.id] };

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ userAgent: UA, locale: 'ja-JP', viewport: { width: 1280, height: 2000 } });
  const page = await ctx.newPage();
  let failed = 0;
  try {
    for (const k of targets) {
      out.items[k.id] ??= {};
      for (const p of k.prizes!) {
        if (!p.rank) continue;
        const query = searchQuery(k.name_ja, p.rank, p.name);
        try {
          const listings = await searchSold(page, query);
          const s = summarize(listings, p.rank);
          // 一筆都沒載到多半是頁面沒長出來，不是真的沒成交：保留上次的值
          if (listings.length === 0 && out.items[k.id][p.rank]) {
            console.log(`  ${k.id} ${p.rank}: no listings, keep previous`);
            await sleep(GAP_MS);
            continue;
          }
          out.items[k.id][p.rank] = { median: s.median, n: s.n, at: now.toISOString(), query };
          console.log(`  ${k.id} ${p.rank}: ${s.median ?? '-'} (n=${s.n}/${listings.length})`);
        } catch (err) {
          failed++;
          console.warn(`  ! ${k.id} ${p.rank}: ${(err as Error).message.split('\n')[0]}`);
        }
        await sleep(GAP_MS);
      }
    }
  } finally {
    await browser.close();
  }
  await writeFile(`${DATA}/market.json`, JSON.stringify(out) + '\n');
  console.log(`done. ${failed} failed`);
  // 大量失敗（被擋）才算整體失敗，讓 workflow 標紅
  if (failed > 0 && failed >= targets.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
