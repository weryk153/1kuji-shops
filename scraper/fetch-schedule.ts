import { fetchListingHtml, fetchProductHtml } from './product-page.ts';
import { parseListing, parseDetail } from './parse-products.ts';
import type { ScheduleFile, ScheduleItem } from './types.ts';

// 抓 [上個月, 本月, 下個月, 下下個月] 的發售清單（JST 月份），再逐一解析詳細頁
export function scheduleMonths(now: Date, before = 1, after = 2): Array<{ year: number; month: number }> {
  const jst = new Date(now.getTime() + 9 * 3600_000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth(); // 0-based
  const out = [];
  for (let d = -before; d <= after; d++) {
    const t = new Date(Date.UTC(y, m + d, 1));
    out.push({ year: t.getUTCFullYear(), month: t.getUTCMonth() + 1 });
  }
  return out;
}

export async function fetchSchedule(now: Date): Promise<ScheduleFile> {
  const months = scheduleMonths(now);
  const items: ScheduleItem[] = [];
  const seen = new Set<string>();
  for (const { year, month } of months) {
    const html = await fetchListingHtml(year, month);
    const list = parseListing(html);
    console.log(`  -> ${year}-${month}: ${list.length} items`);
    for (const it of list) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      items.push(it);
    }
  }
  // 詳細頁單篇失敗只少了價格 / 各賞，不影響日曆
  for (const it of items) {
    try {
      const d = parseDetail(await fetchProductHtml(it.id));
      it.banner_url = d.banner_url;
      it.price = d.price;
      it.stores = d.stores;
      it.prizes = d.prizes;
    } catch (err) {
      console.warn(`  ! detail ${it.id}: ${(err as Error).message}`);
    }
  }
  items.sort((a, b) => (a.shop_date ?? a.online_at ?? '9999').localeCompare(b.shop_date ?? b.online_at ?? '9999'));
  return {
    scraped_at: now.toISOString(),
    months: months.map(({ year, month }) => `${year}-${String(month).padStart(2, '0')}`),
    items,
  };
}
