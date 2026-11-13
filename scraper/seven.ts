// 7-ELEVEN i地圖（福袋&抽抽樂）的一番賞庫存整理（純函式）。
// 原始資料是 openpoint-imap-research 的 `fetch:inventory --all --json` 輸出（inventory.json），
// 在 worker 上跑（要用會員身分換 token，不放 CI）。輸出格式跟 data/tw-familymart.json 一樣，前端共用。
import { normalize, type TwProduct, type TwStore, type TwFamilyMartFile } from './familymart.ts';

export interface SevenRow {
  storeNo: string;
  storeName: string;
  address: string;
  latitude?: number;
  longitude?: number;
  itemName: string;
  remainingQty?: number;
}

// 對照表的 key：全形轉半形、去掉所有空白
export function itemKey(name: string): string {
  return normalize(name).replace(/\s+/g, '');
}

// 「台中市大肚區福山村…」→ { city: 台中市, area: 大肚區 }
export function splitAddress(address: string): { city: string; area: string } {
  const a = normalize(address).replace(/^臺/, '台').replace(/^\d{3,6}/, '');
  const m = a.match(/^(.{2}[市縣])(.{1,3}?[區鄉鎮市])/);
  return m ? { city: m[1].replace('臺', '台'), area: m[2] } : { city: '', area: '' };
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function buildSevenFile(
  rows: SevenRow[],
  map: Record<string, string>,
  catalog: { id: string; name_ja: string; image_url: string }[],
  scrapedAt: string,
): { file: TwFamilyMartFile; unmapped: string[] } {
  const official = new Map(catalog.map((c) => [c.id, c]));
  const stores = new Map<string, TwStore>();
  const names = new Map<string, string>(); // key → 原始品名
  for (const r of rows) {
    const name = normalize(r.itemName);
    if (!name.startsWith('一番賞')) continue; // 同一張地圖還有福袋、盒玩、萌物賞等
    if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) continue;
    const key = itemKey(name);
    names.set(key, name);
    let s = stores.get(r.storeNo);
    if (!s) {
      s = {
        id: r.storeNo,
        name: `7-ELEVEN ${normalize(r.storeName)}門市`,
        address: normalize(r.address),
        lat: round5(r.latitude!),
        lon: round5(r.longitude!),
        ...splitAddress(r.address),
        stock: {},
      };
      stores.set(r.storeNo, s);
    }
    s.stock[key] = r.remainingQty ?? 0;
  }

  const storeList = [...stores.values()].sort((a, b) => a.id.localeCompare(b.id));
  const unmapped: string[] = [];
  const products: TwProduct[] = [...names.entries()].map(([key, name]) => {
    let n = 0;
    let qty = 0;
    for (const s of storeList) {
      const q = s.stock[key];
      if (q > 0) { n++; qty += q; }
    }
    const p: TwProduct = { code: key, name, short: name.replace(/^一番賞\s*/, ''), series: '', stores: n, qty };
    const jp = official.get(map[key] ?? '');
    if (jp) Object.assign(p, { jp_id: jp.id, jp_name: jp.name_ja, image_url: jp.image_url });
    else unmapped.push(name);
    return p;
  }).sort((a, b) => b.stores - a.stores || a.code.localeCompare(b.code));

  return { file: { scraped_at: scrapedAt, source_updated: scrapedAt, products, stores: storeList }, unmapped };
}
