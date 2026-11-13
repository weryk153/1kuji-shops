// 台灣官方一番賞清單：1kuji.com/areas/tw/products 的「発売予定」（即將開賣）與「発売済み」（販售中）。
// 商品 id 跟日本官網相同（例：kimetsu31），台灣頁的分組、圖片都以這份為準。
// 頁面先給 10 筆，其餘靠 /areas/tw/products/more 逐頁載入（伺服器用 session 記頁數，要帶 cookie）。
//
// 用法：npm run scrape:tw-lineup
import { readFile, writeFile } from 'node:fs/promises';
import { UA } from './session.ts';

const BASE = 'https://1kuji.com/areas/tw/products';
const OUT = 'data/tw-lineup.json';
const MAX_PAGES = 12; // 發売済み 會一路列到很舊的商品，最多抓 ~130 筆
const GAP_MS = 1000;

export interface TwLineupItem { id: string; name_ja: string; image_url: string }
export interface TwLineupFile {
  scraped_at: string;
  upcoming: TwLineupItem[];
  released: TwLineupItem[];
  // 從「発売予定」移到「発売済み」的那天 = 台灣開賣日（官網沒寫日期，只能這樣偵測；精度到天）
  released_on?: Record<string, string>;
}

// 上次是即將開賣、這次變販售中的 → 記今天為開賣日；舊紀錄保留
export function detectReleases(prev: TwLineupFile | null, released: TwLineupItem[], today: string): Record<string, string> {
  const out = { ...(prev?.released_on ?? {}) };
  const wasUpcoming = new Set(prev?.upcoming.map((i) => i.id) ?? []);
  for (const i of released) if (wasUpcoming.has(i.id) && !out[i.id]) out[i.id] = today;
  return out;
}

// 台灣日期 YYYY-MM-DD
export function todayTaipei(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 列表頁 HTML 裡的商品卡：<a href="/areas/tw/products/ID"><img src="..."><p class="itemName">NAME</p>
export function parseLineupHtml(html: string): TwLineupItem[] {
  const list = html.match(/<ul class="itemList" id="product_list">([\s\S]*?)<\/ul>/)?.[1] ?? '';
  const out: TwLineupItem[] = [];
  for (const m of list.matchAll(/<a href="\/areas\/tw\/products\/([^"]+)"><img src="([^"]+)"[\s\S]*?<p class="itemName">([\s\S]*?)<\/p>/g)) {
    out.push({ id: m[1], image_url: m[2], name_ja: decode(m[3].trim()) });
  }
  return out;
}

function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function fetchStatus(status: 'sale_before' | 'sale'): Promise<TwLineupItem[]> {
  const first = await fetch(`${BASE}?sale_status=${status}`, { headers: { 'User-Agent': UA } });
  if (!first.ok) throw new Error(`${status}: HTTP ${first.status}`);
  const cookie = first.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const items = parseLineupHtml(await first.text());
  if (items.length === 0) throw new Error(`${status}: 列表解析不到商品，頁面可能改版`);

  for (let page = 2; page <= MAX_PAGES; page++) {
    await sleep(GAP_MS);
    const res = await fetch(`${BASE}/more?sale_status=${status}`, {
      headers: { 'User-Agent': UA, Cookie: cookie, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`${status} more: HTTP ${res.status}`);
    const json = (await res.json()) as { is_last_page: boolean; data: { path: string; image_path: string; name: string }[] };
    for (const d of json.data) items.push({ id: d.path.split('/').pop()!, image_url: d.image_path, name_ja: d.name });
    if (json.is_last_page || json.data.length === 0) break;
  }
  // 同一款偶爾重複出現，保留第一次
  const seen = new Set<string>();
  return items.filter((i) => !seen.has(i.id) && seen.add(i.id));
}

async function main() {
  const upcoming = await fetchStatus('sale_before');
  await sleep(GAP_MS);
  const released = await fetchStatus('sale');
  let prev: TwLineupFile | null = null;
  try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* 第一次跑 */ }
  const released_on = detectReleases(prev, released, todayTaipei());
  const newly = Object.keys(released_on).filter((id) => !prev?.released_on?.[id]);
  if (newly.length) console.log(`  今天開賣：${newly.join(', ')}`);
  const file: TwLineupFile = { scraped_at: new Date().toISOString(), upcoming, released, released_on };
  await writeFile(OUT, JSON.stringify(file) + '\n');
  console.log(`tw-lineup: 即將開賣 ${upcoming.length}、販售中 ${released.length} → ${OUT}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
