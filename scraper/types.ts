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
  city_code: string; // 5 碼市町村代碼（對應 GeoJSON 的 N03_007）
  release_datetime: string; // ISO 8601 with JST offset
}

export interface ShopsFile {
  lottery_id: string;
  scraped_at: string;
  shops: Shop[];
}
