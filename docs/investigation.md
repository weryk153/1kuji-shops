# 1kuji.com 資料取得路徑調查

**調查日期**：2026-04-30
**調查工具**：Chrome DevTools MCP（實際開瀏覽器跑流量）+ curl
**對應任務**：實作計畫 Task 1
**相關檔案**：`tests/fixtures/lotteries-page.html`、`tests/fixtures/shops-page.html`、`tests/fixtures/shop_lists-products.json`、`tests/fixtures/shop_lists-cities-medalist-tokyo.json`、`tests/fixtures/shop_lists-search-medalist-shibuya.json`、`tests/fixtures/shops-map-medalist.json`

---

## TL;DR — 關鍵決策

| 項目 | 結論 |
|------|------|
| 一番賞清單 | **API**：`GET /shop_lists/products.json` |
| 店舖清單 | **API**：`GET /shop_lists/cities.json` + `GET /shop_lists/search.json`（兩階段） |
| 抓取技術 | **`fetch`／`undici`／`got` 即可，不需要 Playwright** |
| robots.txt | 通用爬蟲允許 `/products`、`/shop_lists`、`/shops`；ClaudeBot/GPTBot/Perplexity 等被擋 |
| 認證 | 需先 GET `/shop_lists`（取 cookie + 解析 `<meta name="csrf-token">`），後續 JSON 請求帶 `Cookie` + `X-CSRF-Token` |

---

## 1. robots.txt（已驗證）

來源：`curl https://1kuji.com/robots.txt`（HTTP 200）

```
User-agent: *
Disallow: /mypage$
Disallow: /mypage/
Disallow: /login$
Disallow: /logout$
Disallow: /serials/
```

我們需要的路徑都不在 Disallow：

- `/products`、`/products/<slug>` ✅
- `/shop_lists`、`/shop_lists/products.json`、`/shop_lists/cities.json`、`/shop_lists/search.json` ✅
- `/shops`、`/shops/map.json` ✅

**特別注意**：robots.txt 有針對性封鎖 `ClaudeBot`、`GPTBot`、`OAI-SearchBot`、`ChatGPT-User`、`PerplexityBot`、`SemrushBot`、`YandexBot`、`Pinterestbot`、`DataForSeoBot`、`AwarioRssBot`、`AwarioSmartBot`、`RedekenBot`（全部 `Disallow: /`）。

→ **scraper 必須用識別性 User-Agent**（不能含 `Bot` 之類觸發詞而又不在白名單內），建議：
```
User-Agent: 1kuji-shops-scraper/1.0 (+https://github.com/<owner>/1kuji-shops; contact: <email>)
```
這個 UA 不符合任何 Disallow 區段，會 fall through 到 `User-agent: *` → 允許。

**結論：未被擋，可繼續。**

---

## 2. 站台架構速寫

1kuji.com 是 Bandai Spirits 的 Rails 站，使用：

- **Server-Side Rendered HTML**（一番賞 lineup 等內容直接在 document 裡）
- **JSON XHR endpoints** 給互動式店舖搜尋（`/shop_lists/*.json`、`/shops/map.json`）
- **WOVN.io** 多語自動翻譯（`<!--wovn-src:店頭販売-->店面銷售` 形式）
  - **重要**：直接 `curl` 拿到的 HTML 是 **原始日文**，沒被翻譯。瀏覽器內看到中文是因為 wovn 在 client side 改寫 DOM。所以 scraper 用 `fetch` 拿原文不需要任何特殊處理。
- **Cloudflare** 前置（`cf_clearance` cookie 出現過，但在桌面瀏覽器訪問時沒觸發 challenge）。

---

## 3. 一番賞清單

### 來源（API，**首選**）

```
GET https://1kuji.com/shop_lists/products.json
Headers:
  Cookie: <session-cookie 由先前 GET /shop_lists 取得>
  X-CSRF-Token: <由 /shop_lists 頁面 <meta name="csrf-token"> 取出>
  Content-Type: application/json; charset=utf-8
```

**兩個 header 缺一不可**（curl 實測：缺任一個 → 回 200 但 `products: []`）。

### 取得流程

```ts
// 1. 先取得 cookie + csrf token
const sessionResp = await fetch('https://1kuji.com/shop_lists', {
  headers: { 'User-Agent': UA }
});
const html = await sessionResp.text();
const csrfToken = html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1];
const cookies = sessionResp.headers.getSetCookie(); // or parse manually

// 2. 用同一個 session 打 products.json
const productsResp = await fetch('https://1kuji.com/shop_lists/products.json', {
  headers: {
    'User-Agent': UA,
    'Cookie': cookies.join('; '),
    'X-CSRF-Token': csrfToken,
    'Content-Type': 'application/json; charset=utf-8',
    'Referer': 'https://1kuji.com/shop_lists',
  }
});
const { products } = await productsResp.json();
```

### Response schema

```json
{
  "products": [
    {
      "id": 10636,
      "name": "一番くじ TVアニメ「メダリスト」",
      "image_url": "https://assets.1kuji.com/uploads/product/image/10636/c6eaaf2a-aaec-4e35-8604-dd3b2b69da40.webp",
      "show_url": "medalist",
      "top_image_url": "https://assets.1kuji.com/uploads/product/top_banner/10636/999f5b04-e162-4873-b484-3658d20671a5.webp"
    }
  ],
  "type": "products",
  "is_login": false,
  "token": "<rotation-csrf-token-for-next-request>"
}
```

實測：`/shop_lists/products.json` 回傳 **60 筆**「目前可選店舖搜尋」的一番賞（即「販売中 / 即將開賣」）。完整 fixture：`tests/fixtures/shop_lists-products.json`。

### 欄位對應 → `Lottery`

| 設計欄位 | API 路徑 | 範例值 | 備註 |
|---|---|---|---|
| `Lottery.id` | `products[].show_url` | `"medalist"` | URL slug；可直接當檔案名稱（已是 ASCII / kebab / snake case） |
| `Lottery.name_ja` | `products[].name` | `"一番くじ TVアニメ「メダリスト」"` | 已是原始日文 |
| `Lottery.image_url` | `products[].image_url` | `"https://assets.1kuji.com/.../webp"` | |
| `Lottery.source_url` | `\`https://1kuji.com/products/${show_url}\`` | `"https://1kuji.com/products/medalist"` | 衍生 |
| `Lottery.release_date` | **二次抓取**：`GET /products/<show_url>` 解析 | `"2026-04-03"` | products.json 不含日期，要另抓 detail page |

### 取得 `release_date` — 必須二次抓取產品 detail 頁

`products.json` 不帶日期。最簡單作法：對每個 lottery 抓 `GET /products/<show_url>`（純 SSR HTML），解析：

```html
<section class="aboutCol">
  <h2>一番くじ TVアニメ「メダリスト」</h2>
  <ul>
    <li>■発売日：<br />
      店頭販売：2026年04月03日(金)より順次発売予定<br />
      オンライン販売：2026年04月03日(金)11:00より販売開始予定</li>
    ...
  </ul>
</section>
```

**Selector / 解析策略**（節點 → `release_date`）：

```ts
// cheerio
const detail = $('section.aboutCol .detail ul li').first().text();
// "■発売日：店頭販売：2026年04月03日(金)より順次発売予定 オンライン販売：..."
const m = detail.match(/(\d{4})年(\d{2})月(\d{2})日/);
const release_date = `${m[1]}-${m[2]}-${m[3]}`; // "2026-04-03"
```

註：取「店頭販売」的日期；若沒有店頭只有線上，就 fallback 到 online 行的日期。

**簡化方案（接受）**：也可以用更便宜的 fallback —— `/shop_lists/product_detail?product_id=<show_url>` 回一段 HTML fragment（370 byte 左右），含 `<li>■発売日：2026年04月03日(金)より順次発売予定</li>`。它和 search.json 共用同一個 session，省掉一次完整頁面下載。`tests/fixtures/shops-page.html` 中的 search call 可看到。

### 替代來源（DOM scrape，僅作備援）

`GET /products?sale_month=N&sale_year=YYYY`（純 SSR）：

- 主 selector：`section > div.categoryCol > ul.itemList > li > a[href^="/products/"]`
- 一張卡片內：
  - `a[href]` → slug：`/products/<slug>`
  - `img[src]` → 圖片
  - `p.itemName` → 一番賞名稱（日文）
  - `p.status.shop` + 緊跟著的 `p.date` → 店頭販売日期（如 `"2026年04月03日(金)より順次発売予定"`）
  - `p.status.online` + 緊跟著的 `p.date` → 線上販売日期
- 每月分頁：`?sale_month=4&sale_year=2026`，`?sale_year=plan` 顯示日期未定者
- 月份導覽存在於：`ul.monthList > li > a`，會看到前後 ±2 個月

**只在 `products.json` 突然失效時才改用此路徑。**

---

## 4. 店舖清單

### 來源（API，**首選**，分兩個 endpoint）

```
GET /shop_lists/cities.json?product_id=<numeric_id>&pref=<1..47>
GET /shop_lists/search.json?product_id=<numeric_id>&code=<5-digit-city-code>
```

兩個 endpoint 都需要前述 cookie + CSRF token header（與 products.json 同 session）。

#### 4.1 取得「該都道府縣下，該一番賞有店舖的市區町村」

```
GET /shop_lists/cities.json?product_id=10636&pref=13
```

`pref` 是 1..47 的整數，**不是** JIS 兩位數編碼（北海道=1, ..., 沖縄県=47）。完整對照可從 `/shop_lists` HTML 的 `select#pref_select` 萃取，或 hard-code 進 `data/prefectures.json`。

Response：

```json
{
  "cities": "千代田区(1),13101;新宿区(1),13104;渋谷区(1),13113;立川市(1),13202",
  "type": "cities",
  "token": "<next-csrf-token>"
}
```

**格式說明**：

- `cities` 是 string（不是 array），用 `;` 分隔每個城市
- 每筆格式：`<市区町村名>(<該城市內店舖數>),<5位市區町村code>`
- 若該 (lottery, pref) 沒有任何店舖，`cities` 是空字串 → 該 prefecture 完全沒蛋，可跳過

**Parsing**：

```ts
const entries = res.cities.split(';').filter(Boolean).map(s => {
  const m = s.match(/^(.+)\((\d+)\),(\d+)$/);
  return { name: m[1], shopCount: +m[2], code: m[3] };
});
```

#### 4.2 取得指定市區町村下的店舖細節

```
GET /shop_lists/search.json?product_id=10636&code=13113
```

Response（簡化）：

```json
{
  "shops": [
    {
      "id": 1007553,
      "name": "一番くじ公式ショップ 渋谷MAGNET by SHIBUYA109店",
      "address": "東京都渋谷区神南1-23-10",
      "building": "MAGNET by SHIBUYA109 B1F",
      "phone": null,
      "lat": "35.659945",
      "lon": "139.700954",
      "navi_flag": "non",
      "show_phone_flag": false,
      "parking_flag": false,
      "description": null,
      "display_description_flag": false,
      "updater": 1,
      "active_datetime": "2026-04-03T00:00:00.000+09:00",
      "sellout_flag": 0,
      "created_at": "2026-03-25T16:59:22.223+09:00",
      "sale_display_at": "2026-02-09T10:28:00.000+09:00",
      "sale_on": "2026-04-03",
      "category_id": null
    }
  ],
  "type": "list",
  "token": "<next-csrf-token>"
}
```

### 欄位對應 → `Shop`

| 設計欄位 | API 路徑 | 範例值 | 備註 |
|---|---|---|---|
| `Shop.name` | `shops[].name` | `"一番くじ公式ショップ 渋谷MAGNET by SHIBUYA109店"` | 原始日文 |
| `Shop.address` | `shops[].address`（+ `building` 視需求） | `"東京都渋谷区神南1-23-10"` | 含都道府縣前綴；建議將 `building` 不另存（CSV 給 My Maps 只要街道地址，樓層放 `building` 反而搞糊 geocoder） |
| `Shop.prefecture_code` | 由 `address` 開頭日本地名映射 | `"13"`（東京都） | 透過 `prefectures.json` 的 `name_ja` 反查取 `code` |
| `Shop.release_datetime` | `shops[].active_datetime` | `"2026-04-03T00:00:00.000+09:00"` | 已是 ISO-8601 with JST offset，直接存 |

額外可用欄位（設計暫不保留，但留紀錄供未來使用）：

- `id` — 店舖在 1kuji.com 的內部 ID（用於 `/shops/<id>` 詳情頁、用於 dedupe）
- `lat`, `lon` — 字串型 numeric，**地理座標**（有了就不需要 Google geocoder）
- `sale_on` — 日期版本的 `release_datetime`（純日期）
- `sellout_flag` — 0/1，是否完售（**設計明確不顯示完售狀態**，可忽略）
- `building` — 樓層 / 建物名稱補充
- `phone`、`description`、`navi_flag`、`updater` — 雜項

> **實作建議（非必須）**：因為 `lat`/`lon` 已現成，可考慮把它們也存進 `shops/<id>.json`，未來如果想換成 Leaflet 嵌入地圖就能跳過 geocoder。但 CSV 仍只放 `Name,Address`（依設計第 6 章）。

### 對於「不指定都道府縣，一次拿全部」的處理

**Spec §11 寫的「不選都道府縣」做不到** — JS 會擋（檢查邏輯：`未選択の項目があります。商品、都道府県、市区町村は全て選択してください`）。

替代做法：

1. **首選方案（建議）**：對每個 lottery 全國掃描 ─ 47 個 prefecture × 1 次 cities.json + N 次 search.json：

   ```
   for pref in 1..47:
     cities = GET /shop_lists/cities.json?product_id=<id>&pref=<pref>
     for city in cities:
       shops = GET /shop_lists/search.json?product_id=<id>&code=<city.code>
       merge into all_shops_for_lottery
   ```

   每筆 lottery 預估 50-2,500 次請求（依規模）。整站每日 ~60 lottery × 平均 ~500 calls = ~30,000 calls/day。**搭配 1s 之間隔（含對 1kuji 友善），每日 8 小時內可完成。**

   優化：當 `cities.json` 回 empty 字串就跳過此 prefecture，只對有店的 prefecture 真的呼叫 `search.json`。多數小型 lottery 只覆蓋幾個 prefecture，實際呼叫量遠低於上限。

2. **快速確認 lottery 規模（可選輔助）**：`GET /shops/map.json?product_id=<numeric_id>` 一次回傳該 lottery **全國所有店舖的 id+lat+lon**（semicolon-delimited），但只有 ID 沒有名稱/地址。可用於：
   - **sanity check**：和 47-prefecture 累加結果比對總數，判斷有沒有抓漏
   - **大致估算抓取規模**：在實際 scrape 之前先看總店舖數
   - 不能取代 search.json（沒有名稱地址）

   範例：`product_id=10664`（One Piece）= 12,724 家店，`product_id=10651`（DB Goku）= 18,847 家店。

### 替代來源（DOM scrape）

不適用 — 整個 shop_lists 頁面是 JS-rendered 的 SPA-lite，初始 HTML 只有 dropdown 殼，沒有店舖資料。**若要 DOM scrape 必須用 Playwright**，但既然 API 路徑明確，沒理由走這條。

---

## 5. 分頁／limit 機制

| 對象 | 機制 | 處理 |
|---|---|---|
| `products.json` | 無分頁，一次回 60 筆 | 直接吃 |
| `cities.json` | 無分頁，一次回該 (pref, lottery) 全部市區町村 | 直接吃 |
| `search.json` | **每次只回單一城市內全部店舖**（即使 51 筆也一次給） | 沒有 page 參數，無 limit |
| `/shops/map.json` | 一次回全國所有 shop_id+座標（lat/lon） | 直接吃，但只有座標沒有名稱 |
| `/products?sale_month=...` | SSR，依月份分頁，無 per-month 內 limit | 一個月一次 GET |

**沒有 hidden limit 參數需要試探**。實測 `search.json` 對單一城市 51 家店一次回完，未截斷。

**實作的「分頁」其實是 city iteration**：對某 prefecture 內 N 個 city 各打一次 search.json。

---

## 6. 認證 / Anti-Bot 觀察

| 項目 | 觀察 |
|---|---|
| Cloudflare | 桌面 Chrome 訪問沒看到 challenge；`cf_clearance` cookie 自動下發。暫不處理；若 GitHub Actions 上 IP 觸發 challenge，可加 `playwright` 或 `cf-bypass` lib，目前先不預先複雜化 |
| CSRF | Rails 標配，**必須先 GET `/shop_lists` 取 `<meta name="csrf-token">` 配合 cookie 一起送** |
| Rate limit | 沒看到明顯 rate-limit response。建議自律：每個 request 間隔 1 秒（spec §11 已寫） |
| 登入 | 不需要登入（`is_login: false` 就能拿到 products / cities / search），`/mypage` 才需要登入但我們不碰 |
| Session | session cookie (`_bsp_lt_pro_general_sid`) 有 12 小時 TTL；爬蟲可在每次 run 開頭重新 establish session |

---

## 7. 確定流程（給 T7 / T8 / T10 直接抄）

```ts
// scraper/scrape.ts (illustrative pseudo-code)

const UA = '1kuji-shops-scraper/1.0 (+https://github.com/<owner>/1kuji-shops)';

// === Step 0: establish session ===
async function getSession() {
  const resp = await fetch('https://1kuji.com/shop_lists', { headers: { 'User-Agent': UA } });
  const html = await resp.text();
  const csrf = html.match(/<meta name="csrf-token" content="([^"]+)"/)![1];
  const cookies = resp.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  return { csrf, cookies };
}

const apiHeaders = (s) => ({
  'User-Agent': UA,
  'Cookie': s.cookies,
  'X-CSRF-Token': s.csrf,
  'Content-Type': 'application/json; charset=utf-8',
  'Referer': 'https://1kuji.com/shop_lists',
});

// === Step 1: fetch lottery list ===
async function fetchLotteries(s) {
  const r = await fetch('https://1kuji.com/shop_lists/products.json', { headers: apiHeaders(s) });
  const { products } = await r.json();
  return products; // [{id, name, show_url, image_url, ...}]
}

// === Step 2: fetch release_date for each lottery (parse HTML) ===
async function fetchReleaseDate(slug) {
  const r = await fetch(`https://1kuji.com/products/${slug}`, { headers: { 'User-Agent': UA } });
  const html = await r.text();
  // section.aboutCol .detail ul li 第一行 → 抓 YYYY年MM月DD日 第一個 match
  const m = html.match(/<section[^>]*class="aboutCol"[\s\S]*?■発売日：[\s\S]*?(\d{4})年(\d{2})月(\d{2})日/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// === Step 3: for each lottery, scrape all shops nationwide ===
async function fetchAllShops(s, productId) {
  const all = [];
  for (let pref = 1; pref <= 47; pref++) {
    const cR = await fetch(`https://1kuji.com/shop_lists/cities.json?product_id=${productId}&pref=${pref}`, { headers: apiHeaders(s) });
    const cJ = await cR.json();
    if (!cJ.cities) continue; // empty string = no shops in this pref
    const cities = cJ.cities.split(';').filter(Boolean);
    for (const cityStr of cities) {
      const code = cityStr.split(',')[1];
      await sleep(1000); // 友善節流
      const sR = await fetch(`https://1kuji.com/shop_lists/search.json?product_id=${productId}&code=${code}`, { headers: apiHeaders(s) });
      const sJ = await sR.json();
      all.push(...sJ.shops);
    }
    await sleep(1000);
  }
  return all;
}

// === Step 4: derive prefecture_code from address ===
// 用 prefectures.json 的 name_ja 做最長前綴比對
function inferPrefCode(address, prefMap /* { "東京都": "13", ... } */) {
  for (const [name, code] of Object.entries(prefMap)) {
    if (address.startsWith(name)) return code;
  }
  return null;
}
```

---

## 8. 風險 / 待確認

| 風險 | 評估 | 緩解 |
|---|---|---|
| 1kuji 改變 CSRF 機制 | 低，Rails 標配 | scraper 加 fallback：若 products.json 回 empty，重試刷 csrf |
| products.json 名單更新延遲 | 不知道更新頻率，但每日跑一次足夠 | 沒有可比資料源，相信即可 |
| Cloudflare 在 GitHub Actions IP block | 可能，雖然這次測試沒遇到 | 第一次跑時觀察；若被擋，最後手段改 Playwright + stealth |
| `search.json` 在罕見大城市突然分頁 | 未觀察到。51 家城市測過沒分頁 | 在 scraper 加 sanity check：`search.json.shops.length` 應 ≈ `cities.json` 顯示的 `(N)` |
| 一番賞下檔的瞬間 ID 變化 | products.json 應該會少掉那筆 | spec §5「保留一週緩衝期再刪」策略已涵蓋 |
| `prefecture_code` 用「01」JIS 還是「1」 1kuji 內部碼？ | 設計用 JIS（`"01"`-`"47"`），1kuji 用 `1`-`47` | scraper 用「name 前綴比對」決定 prefecture，把 1kuji 的數字 ID 完全隔離；最終存進 JSON 用 JIS 兩位字串 `"01"`-`"47"` |

---

## 9. 結論

- **API path 明確、文件齊全、不需要 Playwright。**
- 三個 endpoint：`/shop_lists/products.json`、`/shop_lists/cities.json`、`/shop_lists/search.json`。
- 一個額外輔助：`/shops/map.json`（quick total-count 探勘用）。
- 一個額外二次抓取：`/products/<slug>` 解析 release_date（以 cheerio + regex）。
- 認證：cookie + CSRF，由 GET `/shop_lists` 取得後續 reuse。
- 分頁：無，但需要 city-by-city iteration。
- 自律 rate limit：1 req/s（保守估計 single lottery 完整 scrape 約 2-15 分鐘，全 60 lottery 約 8-12 小時，可在 GitHub Actions 6h 工作流內分批，或 timeout 上限是 6 小時 — 確認可加 timeout-minutes: 360 並分批 commit）。

T7 / T8 / T10 可以直接依此文件的 §3、§4、§7 寫實作。
