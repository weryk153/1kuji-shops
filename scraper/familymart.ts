// 全家便利商店「造型卡/一番賞地圖」的資料整理（純函式，方便測試）
// API 來源：stamp.family.com.tw/api/maps（全家官方地圖網站用的公開端點，免登入）

export const FM_PROJECT_CODE = '202112072'; // MapList 裡的「造型卡/一番賞地圖」

// --- API 回傳型別（只列用得到的欄位） ---
export interface FmClassification {
  groupCode: string;
  groupName: string;
  categories: { categoryCode: string; categoryName: string; products: { productCode: string; productName: string }[] }[];
}

export interface FmStore {
  oldPKey: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  updateDate: string;
  info: { code: string; name: string; categories: { code: string; name: string; products: { code: string; name: string; qty: number }[] }[] }[];
}

// --- 輸出型別 ---
export interface TwProduct {
  code: string;
  name: string;    // 全家的品名（半形化），例：一番賞七龍珠SB_獎籤
  short: string;   // 顯示用，例：七龍珠SB
  series: string;  // 全家的分類名，例：七龍珠
  stores: number;  // 有貨（qty > 0）的門市數
  qty: number;     // 全台剩餘籤數合計
  jp_id?: string;      // 對應的官方商品 id（scraper/tw-jp-map.json），例：db_sb
  jp_name?: string;    // 官方商品名，例：一番くじ ドラゴンボール スペクタクルバトル
  image_url?: string;  // 官方商品圖
}

export interface TwStore {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  city: string;
  area: string;
  stock: Record<string, number>; // productCode → 剩餘籤數
}

export interface TwFamilyMartFile {
  scraped_at: string;
  source_updated: string | null; // 全家端資料的更新時間（各店 updateDate 最大值）
  products: TwProduct[];
  stores: TwStore[];
}

// 全形英數、底線轉半形；去頭尾空白
export function normalize(s: string): string {
  return s.normalize('NFKC').trim();
}

// 「一番賞七龍珠ＳＢ＿獎籤」→「七龍珠SB」
export function shortName(productName: string): string {
  return normalize(productName)
    .replace(/^一番賞\s*/, '')
    .replace(/[_\s]*(獎籤|賞券|籤)$/, '')
    .replace(/_+$/, '')
    .trim();
}

// 分類資料 → 一番賞品項（只取群組名含「一番賞」的，不含樂淘賞、好集賞等）
export function kujiProducts(groups: FmClassification[]): Map<string, Omit<TwProduct, 'stores' | 'qty'>> {
  const out = new Map<string, Omit<TwProduct, 'stores' | 'qty'>>();
  for (const g of groups) {
    if (!normalize(g.groupName).includes('一番賞')) continue;
    for (const c of g.categories) {
      for (const p of c.products) {
        out.set(p.productCode, {
          code: p.productCode,
          name: normalize(p.productName),
          short: shortName(p.productName),
          series: normalize(c.categoryName),
        });
      }
    }
  }
  return out;
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

// 各郵遞區號查詢結果 → 去重後的門市與品項統計
// 同一間店可能出現在多個查詢結果，以 oldPKey 去重（後到的覆蓋，數量以最新為準）
export function buildFile(
  batches: { city: string; area: string; stores: FmStore[] }[],
  products: Map<string, Omit<TwProduct, 'stores' | 'qty'>>,
  scrapedAt: string,
): TwFamilyMartFile {
  const stores = new Map<string, TwStore>();
  let sourceUpdated: string | null = null;

  for (const { city, area, stores: list } of batches) {
    for (const s of list) {
      const stock: Record<string, number> = {};
      for (const info of s.info ?? []) {
        for (const c of info.categories ?? []) {
          for (const p of c.products ?? []) {
            if (products.has(p.code) && Number.isFinite(p.qty)) stock[p.code] = p.qty;
          }
        }
      }
      if (Object.keys(stock).length === 0) continue;
      if (s.updateDate && (!sourceUpdated || s.updateDate > sourceUpdated)) sourceUpdated = s.updateDate;
      stores.set(s.oldPKey, {
        id: s.oldPKey,
        name: normalize(s.name),
        address: normalize(s.address),
        lat: round5(s.latitude),
        lon: round5(s.longitude),
        city,
        area,
        stock,
      });
    }
  }

  const storeList = [...stores.values()].sort((a, b) => a.id.localeCompare(b.id));
  const productList: TwProduct[] = [...products.values()].map((p) => {
    let n = 0;
    let qty = 0;
    for (const s of storeList) {
      const q = s.stock[p.code];
      if (q > 0) { n++; qty += q; }
    }
    return { ...p, stores: n, qty };
  });
  productList.sort((a, b) => b.stores - a.stores || a.code.localeCompare(b.code));

  return { scraped_at: scrapedAt, source_updated: sourceUpdated, products: productList, stores: storeList };
}

// 全家品項 → 官方台灣清單的商品（data/tw-lineup.json，id 跟日本官網相同）。
// 對照表沒有的回傳在 unmapped，讓爬蟲 log 出來補。
export interface CatalogItem { id: string; name_ja: string; image_url: string }

export function attachJp(
  products: TwProduct[],
  map: Record<string, string>,
  catalog: CatalogItem[],
): { products: TwProduct[]; unmapped: TwProduct[] } {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const unmapped: TwProduct[] = [];
  const out = products.map((p) => {
    const jp = byId.get(map[p.code] ?? '');
    if (!jp) { unmapped.push(p); return p; }
    return { ...p, jp_id: jp.id, jp_name: jp.name_ja, image_url: jp.image_url };
  });
  return { products: out, unmapped };
}
