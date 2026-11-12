// 解析 1kuji.com 的每月商品清單頁（/products?sale_month=M&sale_year=Y）
// 與商品詳細頁（/products/<slug>）。兩者都是 SSR HTML，用 regex 解即可。
import type { ScheduleItem, Prize } from './types.ts';

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
};

function decode(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function text(html: string): string {
  return decode(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

// "2026年11月05日(木)17:00より…" → { date: '2026-11-05', time: '17:00' }
export function parseJaDate(s: string): { date: string; time: string | null } | null {
  const m = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日(?:\([^)]*\))?\s*(\d{1,2}:\d{2})?/);
  if (!m) return null;
  const date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const time = m[4] ? m[4].padStart(5, '0') : null;
  return { date, time };
}

export function parseListing(html: string): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  const seen = new Set<string>();
  for (const block of html.split('<div class="categoryCol">').slice(1)) {
    const h4 = block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/);
    const category = h4 ? text(h4[1]) : '';
    const listEnd = block.indexOf('</ul>');
    const list = listEnd >= 0 ? block.slice(0, listEnd) : block;
    for (const li of list.split('<li>').slice(1)) {
      const href = li.match(/href="\/products\/([^"?#/]+)"/);
      if (!href) continue;
      const id = decode(href[1]);
      if (seen.has(id)) continue;
      const name = li.match(/<p class="itemName">([\s\S]*?)<\/p>/);
      if (!name) continue;
      seen.add(id);
      const img = li.match(/<img[^>]*src="([^"]+)"/);
      let shop_date: string | null = null;
      let online_at: string | null = null;
      for (const m of li.matchAll(/<p class="status (shop|online)">[^<]*<\/p>\s*<p class="date">([^<]*)<\/p>/g)) {
        const d = parseJaDate(m[2]);
        if (!d) continue;
        if (m[1] === 'shop') shop_date = d.date;
        else online_at = `${d.date}T${d.time ?? '00:00'}:00+09:00`;
      }
      items.push({
        id,
        name_ja: text(name[1]),
        category,
        image_url: img ? decode(img[1]) : '',
        shop_date,
        online_at,
      });
    }
  }
  return items;
}

export interface ProductDetail {
  banner_url: string | null;
  price: number | null;
  stores: string | null;
  prizes: Prize[];
}

export function parseDetail(html: string): ProductDetail {
  const about = html.match(/<section[^>]*class="aboutCol"[\s\S]*?<\/section>/)?.[0] ?? '';
  const priceM = about.match(/メーカー希望小売価格：\s*1回\s*([\d,]+)\s*円/);
  const storesM = about.match(/■取扱店：([\s\S]*?)<\/li>/);

  const prizes: Prize[] = [];
  for (const block of html.split('<div class="itemColList">').slice(1)) {
    const h4 = block.match(/<h4 class="name pc">([\s\S]*?)<\/h4>/) ?? block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/);
    if (!h4) continue;
    const full = text(h4[1]);
    const rm = full.match(/^(\S*?賞)\s*(.*)$/);
    const kinds = block.match(/■全\s*(\d+)\s*種/);
    const size = block.match(/■サイズ：([^<]+)</);
    const img = block.match(/<ul class="slider-item[^"]*">[\s\S]*?<img[^>]*src="([^"]+)"/);
    prizes.push({
      rank: rm ? rm[1] : '',
      name: rm ? rm[2] : full,
      kinds: kinds ? Number(kinds[1]) : null,
      size: size ? text(size[1]) : null,
      image_url: img ? decode(img[1]) : null,
    });
  }

  const banner = html.match(/<section class="mvCol">[\s\S]*?<img[^>]*src="([^"]+)"/);
  return {
    banner_url: banner ? decode(banner[1]) : null,
    price: priceM ? Number(priceM[1].replace(/,/g, '')) : null,
    stores: storesM ? text(storesM[1]) : null,
    prizes,
  };
}
