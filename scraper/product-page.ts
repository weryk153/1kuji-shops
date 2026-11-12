import { UA } from './session.ts';

// 商品詳細頁 HTML 快取：fetchLotteries 與 fetchSchedule 都要讀同一批頁面，
// 同一輪 scrape 內只抓一次。每次實際連線後停 1 秒節流。
const cache = new Map<string, string>();

export async function fetchProductHtml(slug: string): Promise<string> {
  const hit = cache.get(slug);
  if (hit !== undefined) return hit;
  try {
    const res = await fetch(`https://1kuji.com/products/${encodeURIComponent(slug)}`, {
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) throw new Error(`detail page failed for ${slug}: ${res.status}`);
    const html = await res.text();
    cache.set(slug, html);
    return html;
  } finally {
    await sleep(1000);
  }
}

export async function fetchListingHtml(year: number, month: number): Promise<string> {
  try {
    const res = await fetch(`https://1kuji.com/products?sale_month=${month}&sale_year=${year}`, {
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) throw new Error(`listing ${year}-${month} failed: ${res.status}`);
    return await res.text();
  } finally {
    await sleep(1000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
