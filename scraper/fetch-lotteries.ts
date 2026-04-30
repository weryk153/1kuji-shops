import type { Lottery } from './types.ts';
import { establishSession, apiHeaders, UA, type Session } from './session.ts';

const PRODUCTS_URL = 'https://1kuji.com/shop_lists/products.json';

interface ProductsApiResponse {
  products: Array<{
    id: number;
    name: string;
    show_url: string;
    image_url: string;
  }>;
}

export async function fetchLotteries(session?: Session): Promise<Lottery[]> {
  const s = session ?? (await establishSession());

  const res = await fetch(PRODUCTS_URL, { headers: apiHeaders(s) });
  if (!res.ok) throw new Error(`products.json failed: ${res.status}`);
  const data = (await res.json()) as ProductsApiResponse;
  if (!Array.isArray(data.products) || data.products.length === 0) {
    throw new Error('products.json returned empty list (CSRF/cookie likely missing)');
  }

  // 對每筆 lottery 二次抓 detail page，解 release_date。1 秒一個請求節流。
  const lotteries: Lottery[] = [];
  for (const p of data.products) {
    const release_date = await fetchReleaseDate(p.show_url);
    lotteries.push({
      id: p.show_url,
      product_id: p.id,
      name_ja: p.name,
      release_date,
      image_url: p.image_url,
      source_url: `https://1kuji.com/products/${p.show_url}`,
    });
    await sleep(1000);
  }
  return lotteries;
}

async function fetchReleaseDate(slug: string): Promise<string> {
  const res = await fetch(`https://1kuji.com/products/${slug}`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`detail page failed for ${slug}: ${res.status}`);
  const html = await res.text();
  // <section class="aboutCol"> ... ■発売日：店頭販売：YYYY年MM月DD日 ...
  const m = html.match(
    /<section[^>]*class="aboutCol"[\s\S]*?■発売日：[\s\S]*?(\d{4})年(\d{2})月(\d{2})日/
  );
  if (!m) throw new Error(`could not parse release_date for ${slug}`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
