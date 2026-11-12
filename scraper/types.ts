export type PrefectureCode = string; // "01" - "47"

export interface Prefecture {
  code: PrefectureCode;
  name_ja: string;
  name_zh: string;
}

export interface Lottery {
  id: string;             // slug，例如 "medalist"，做為檔名與 URL 參數
  product_id: number;     // 1kuji 內部 numeric id，呼叫 cities.json/search.json 用
  name_ja: string;
  release_date: string;   // YYYY-MM-DD
  image_url: string;
  source_url: string;
}

export interface LotteriesFile {
  scraped_at: string; // ISO 8601
  lotteries: Lottery[];
}

export interface Shop {
  name: string;
  address: string;
  prefecture_code: PrefectureCode;
  city: string; // 市区町村名稱，例：「新宿区」「札幌市中央区」（來自 1kuji cities API）
  release_datetime: string; // ISO 8601 with JST offset
  lat: number; // 4 位小數，~11m 精度
  lon: number;
  sellout_flag?: 1; // 售完才出現；undefined / 0 = 還有貨
}

export interface ShopsFile {
  lottery_id: string;
  scraped_at: string;
  shops: Shop[];
}

// 發售日曆：每月商品清單頁的一筆，加上詳細頁解析出的價格與各賞
export interface Prize {
  rank: string;            // "A賞"、"ラストワン賞"；解不出來時為空字串
  name: string;
  kinds: number | null;    // 全 N 種
  size: string | null;
  image_url: string | null;
}

export interface ScheduleItem {
  id: string;              // slug
  name_ja: string;
  category: string;        // "一番くじ"、"一番くじちょこっと" 等
  image_url: string;
  shop_date: string | null;  // 店頭販売日 YYYY-MM-DD
  online_at: string | null;  // オンライン販売開始 ISO 8601（JST）
  banner_url?: string | null; // 官網商品頁頂端橫幅（寬圖）
  price?: number | null;     // 1 回價格（日圓，含稅）
  stores?: string | null;    // 取扱店原文
  prizes?: Prize[];
}

export interface ScheduleFile {
  scraped_at: string;
  months: string[];        // ["2026-10", ...]
  items: ScheduleItem[];
}
