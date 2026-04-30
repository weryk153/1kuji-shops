# 一番賞店舖查詢工具 設計文件

**日期**：2026-04-30
**狀態**：草案，待實作

---

## 1. 目標

做一個小型網路工具，讓使用者選擇「一番賞 × 都道府縣」，得到該組合下所有 1kuji.com 公開的店舖列表。使用者可：

- 直接在工具裡瀏覽店舖（店名、地址、開賣時間）
- 點單一店家用 Google 地圖開啟
- 複製分享連結（URL 帶選擇參數）給朋友
- 下載 CSV 自行匯入 Google My Maps 看整張地圖

主要用途是分享「最近的一番賞哪裡有賣」給朋友圈，使用規模 < 100 人/月。

## 2. 範圍

**做**：

- 涵蓋 1kuji.com「販售中 / 即將開賣」的一番賞，**進一步限制在開賣日 [today - 30 天, today + 14 天] 視窗內**（理由：API 必須 prefecture × city 逐一抓，全 60 個 lottery 需 8-12 小時超出 GitHub Actions 6h 限制；該視窗保留正在販售與即將開賣的 lottery，已下檔太久或太遠期的不爬）
- 47 都道府縣篩選（必填）
- 中文 UI（一番賞名稱保留日文）
- 每日自動更新資料

**不做**：

- 歷史一番賞（已下檔的不保留）
- 庫存 / 完售狀態（每日快取太舊，顯示會誤導）
- 自動建立 Google My Maps 地圖（Google 沒有公開 API）
- 嵌入式地圖（Leaflet 等）
- 收藏 / 通知 / 多語切換 / 暗黑模式

## 3. 架構

```
┌──────────────────────────────────────────────────────────┐
│  GitHub Repo                                              │
│  ┌─────────────────┐         ┌──────────────────┐        │
│  │ scraper/        │  cron   │ data/            │        │
│  │  └ scrape.ts    │────────▶│  ├ lotteries.json│        │
│  │   (Playwright)  │  daily  │  └ shops/        │        │
│  └─────────────────┘         │     └ <id>.json  │        │
│         ▲                    └──────────────────┘        │
│         │ GitHub Actions             │                    │
│         │                            │ 靜態託管           │
└─────────┼────────────────────────────┼────────────────────┘
          │                            ▼
   1kuji.com                 ┌──────────────────┐
   公開頁面                   │ Cloudflare Pages │
                             │ (純靜態)          │
                             └──────────────────┘
                                      ▲
                                  使用者瀏覽器
                                  ↓ 下載 CSV
                             Google My Maps（手動匯入）
```

三個元件：

1. **爬蟲（`scraper/`）** — TypeScript + Playwright，跑在 GitHub Actions，每日抓 1kuji.com，產出 JSON。
2. **資料層（`data/*.json`）** — 純 JSON 提交進 repo，是 single source of truth。
3. **前端（`web/`）** — 純 HTML + vanilla JS，部署到 Cloudflare Pages。

選擇靜態 + 預抓的理由：
- 一番賞名單變動慢（一週一次）、店舖名單幾乎不變，24h 快取完全足夠
- 使用者體驗最好（瞬間出結果，無冷啟動）
- 零運行成本，無 CORS 問題，每日才打 1kuji 一次不會被反爬封
- 爬蟲在受控的 Actions 環境跑，比 serverless 環境好除錯

## 4. 資料模型

### 目錄

```
data/
├── prefectures.json          # 47 都道府縣（靜態，手動建立）
├── lotteries.json            # 販售中一番賞清單
└── shops/
    └── <lottery_id>.json     # 每個一番賞一個檔
```

### Schema

**`prefectures.json`**（靜態，47 筆）

```json
[
  { "code": "01", "name_ja": "北海道", "name_zh": "北海道" },
  { "code": "13", "name_ja": "東京都", "name_zh": "東京都" },
  { "code": "27", "name_ja": "大阪府", "name_zh": "大阪府" }
]
```

**`lotteries.json`**

```json
{
  "scraped_at": "2026-04-30T03:00:00Z",
  "lotteries": [
    {
      "id": "dragonball-vol5",
      "name_ja": "ドラゴンボール 一番くじ Vol.5",
      "release_date": "2026-05-15",
      "image_url": "https://1kuji.com/...",
      "source_url": "https://1kuji.com/products/..."
    }
  ]
}
```

`id` 是從 `source_url` 衍生的 slug（具體規則於 writing-plans 階段確認），需符合檔名安全字元。

**`shops/<lottery_id>.json`**

```json
{
  "lottery_id": "dragonball-vol5",
  "scraped_at": "2026-04-30T03:00:00Z",
  "shops": [
    {
      "name": "ローソン 渋谷スクランブル店",
      "address": "東京都渋谷区道玄坂2-1-1",
      "prefecture_code": "13",
      "release_datetime": "2026-05-15T10:00:00+09:00"
    }
  ]
}
```

`prefecture_code` 由地址開頭的「○○都/府/県/道」對照 `prefectures.json` 取出。經緯度不存（依賴 Google geocoder 處理）。

## 5. 爬蟲

### 流程

1. **抓「販售中 / 即將開賣」一番賞清單**
   - 從 1kuji.com 首頁或 `/products` 頁面解析
   - 寫入 `data/lotteries.json`
2. **對每個一番賞抓所有店舖**
   - 進 `/shop_lists`，選該商品，**不指定都道府縣**（一次拿全部）
   - 解析 `(name, address, release_datetime)` for each shop
   - 由地址前綴推算 `prefecture_code`
   - 寫入 `data/shops/<lottery_id>.json`
3. **清掉已下檔一番賞的 shops JSON**（保留一週緩衝期再刪，避免分享連結瞬間 404）

技術細節（DOM 結構、是否有 JSON API、selector）留到 writing-plans 階段實際打開頁面確認。

### 排程

`.github/workflows/scrape.yml`：

- 排程：每天 UTC 03:00（JST 12:00）
- 手動：`workflow_dispatch` 按鈕
- PR 測試：dry-run，不 commit
- 流程：checkout → npm install → playwright install chromium → 跑 `tsx scraper/scrape.ts` → 若 `data/` 有變更則 commit + push
- 失敗時 GitHub 自動寄 email 給 repo owner

### 錯誤處理

| 情境 | 處理 |
|------|------|
| 1kuji 整站 503 | retry 3 次（5s, 15s, 45s backoff），仍失敗則 Action 失敗 → email |
| DOM 解析失敗 | 拋例外，Action 失敗 → email，**不 commit**（保留舊資料優於壞資料） |
| 部分一番賞抓不到店舖 | log warning，繼續其他的 |
| 一番賞下檔 | 從 `lotteries.json` 移除，`shops/<id>.json` 保留一週後刪 |
| 完全沒變化 | 不 commit，避免雜訊 commit |

## 6. 前端

### 頁面結構

```
┌──────────────────────────────────────────────────────────┐
│  🎯 一番賞店舖查詢                                          │
│  資料來源：1kuji.com・最後更新：2026-04-30 12:00            │
├──────────────────────────────────────────────────────────┤
│  一番賞    [選擇一番賞...                          ▼]    │
│  都道府縣  [選擇都道府縣...                        ▼]    │
│                                                          │
│  [📋 複製分享連結]   [⬇ 下載 CSV (Google My Maps 用)]    │
├──────────────────────────────────────────────────────────┤
│  📍 共 23 家店舖（東京都）                                 │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ ローソン 渋谷スクランブル店                       │    │
│  │ 東京都渋谷区道玄坂2-1-1                  [📍開地圖]│    │
│  │ 開賣：2026-05-15 10:00                          │    │
│  └────────────────────────────────────────────────┘    │
│  ...                                                    │
└──────────────────────────────────────────────────────────┘
```

### 互動

- 頁面開啟時 fetch `/data/lotteries.json` 與 `/data/prefectures.json` 填充下拉選單
- 都道府縣是必填（**沒有「全部」選項**），未選時顯示「請選擇都道府縣」
- 一番賞 + 都道府縣都選了之後，fetch 對應的 `shops/<id>.json`，篩選出符合 `prefecture_code` 的店家 render 出來
- URL 雙向同步：選擇變更時用 `history.replaceState` 更新 `?lottery=X&prefecture=YY`，**不重新載入頁面**
- 進入頁面時若 URL 帶參數 → 自動還原下拉選單與列表
- 「複製分享連結」按鈕：抓 `window.location.href` 寫入 clipboard，按鈕短暫變「✓ 已複製」
- 單店地圖連結：`https://www.google.com/maps/search/?api=1&query=<encodeURIComponent(地址)>`，新分頁開啟
- 不顯示完售 / 庫存資訊（每日快取太舊）

### CSV 格式（給 Google My Maps）

對齊使用者既有匯入慣例（已驗證可用的最簡格式）：

```csv
Name,Address
ドン・キホーテ栄本店,愛知県名古屋市中区錦３丁目１７−１５ ３階レジ
ヨドバシカメラ サンシャインサカエ店,愛知県名古屋市中区錦3丁目24-4
```

- 純 UTF-8（**不加 BOM**，避免污染第一欄欄名導致 My Maps 解析失敗）
- 兩個欄位 `Name,Address`（英文欄名）—— My Maps 對標準英文欄名會自動辨識，省去匯入時手動指定欄位的步驟
- **不放開賣時間或其他欄位** —— CSV 用途單一（給 My Maps 看地圖），開賣時間繼續在工具的 UI 列表顯示
- 檔名：`一番くじ_<一番賞名稱>_<都道府縣>_<YYYY-MM-DD>発売_店舗リスト.csv`
  - 例：`一番くじ_ドラゴンボール_東京都_2026-05-15発売_店舗リスト.csv`
  - `<一番賞名稱>` 來自 `lotteries.json` 的 `name_ja`，去掉「一番くじ」前綴；檔名安全字元處理（移除 `/`、`\`、`:` 等）細節留 writing-plans
  - `<YYYY-MM-DD発売>` 取自 `lotteries.json` 的 `release_date`（**開賣日期**，不是爬蟲執行日期）
- 地址保留 1kuji.com 原樣（含全形數字、樓層補充等）—— Google geocoder 對日本住所容錯良好
- **單檔上限 2000 列**（Google My Maps 限制）。實務上單一都道府縣店舖數遠低於此；若未來踩到上限再考慮分檔

### 技術選擇

- HTML + 純 vanilla JS + 純 CSS（無框架）
- 不引入 build step，`web/` 目錄就是部署目錄
- 約 1 個 HTML、1 個 JS、1 個 CSS 檔

### 錯誤處理

| 情境 | 處理 |
|------|------|
| `lotteries.json` 載入失敗 | 顯示「資料暫時無法載入，請稍後再試」 |
| URL 帶不存在的 `lottery` | 提示「找不到此一番賞，可能已下檔」+ 重設下拉 |
| URL 帶不存在的 `prefecture` 代碼 | 同上，重設下拉 |
| 該組合 0 家店 | 顯示「目前沒有販售店舖」（**非錯誤**） |
| 資料超過 48 小時未更新 | 頁面顯示橘色警示 |

## 7. 使用者流程

**情境：分享「ドラゴンボール × 東京都」店舖清單給朋友**

1. 開啟 `https://1kuji-shops.pages.dev/`
2. 選一番賞「ドラゴンボール一番くじ Vol.5」
3. 選都道府縣「東京都」
4. 網址自動變為 `?lottery=dragonball-vol5&prefecture=13`
5. 點「📋 複製分享連結」貼到 LINE/Discord
6. 朋友點開連結 → 看到同樣的列表 → 自行選擇：
   - 點 📍 看單店位置
   - 下載 CSV 匯入自己的 My Maps

## 8. 部署

### Cloudflare Pages 設定

- Framework: None
- Build command: `npm run build`（內容為 `cp -r data web/data`）
- Output directory: `web`
- 連 GitHub repo，main branch 自動部署

### 部署一次性步驟

1. `git init` 後 push 到 GitHub
2. Cloudflare Pages 連 repo 並設定如上
3. 啟用 GitHub Actions 排程
4. 手動觸發 `workflow_dispatch` 跑首次爬蟲

### 開發環境

- Node 20+
- 跑爬蟲：`npx tsx scraper/scrape.ts`
- 跑前端：`npx serve web/`
- 部署：push 到 main

## 9. 目錄結構

```
1kuji-shops/
├── README.md
├── package.json
├── tsconfig.json
├── .gitignore
│
├── web/
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── data/
│   ├── prefectures.json
│   ├── lotteries.json
│   └── shops/
│       └── <lottery_id>.json
│
├── scraper/
│   ├── scrape.ts
│   ├── fetch-lotteries.ts
│   ├── fetch-shops.ts
│   ├── parse.ts
│   └── types.ts
│
└── .github/
    └── workflows/
        └── scrape.yml
```

`scraper/types.ts` 與前端共用 type 定義（前端 JS 不直接 import 但作為 schema 文件）。

## 10. 監控

- **被動**：GitHub Actions 失敗 → GitHub 自動寄 email
- **資料新鮮度**：頁面右上角顯示 `lotteries.json.scraped_at`，超過 48 小時顯示橘色警示
- **手動觸發**：`workflow_dispatch` 隨時可跑

## 11. 實作細節（Task 1 調查後已確認）

詳見 `docs/investigation.md`。摘要：

- **API path（首選）**：`/shop_lists/products.json`（lottery list）、`/shop_lists/cities.json`（pref → cities）、`/shop_lists/search.json`（city → shops）
- **不需要 Playwright**，純 fetch 即可
- **認證**：先 GET `/shop_lists` 取 session cookie + CSRF token，後續 JSON 請求帶 `Cookie` + `X-CSRF-Token` header
- **節流**：1 req/s（已寫入實作計畫）
- **分頁**：API 無分頁，但需要對每個 lottery iterate 47 prefecture + N city
- **`Lottery.id`**：用 `products[].show_url`（已是 ASCII slug）
- **`Lottery.release_date`**：products.json 不帶，需二次抓 `/products/<show_url>` HTML 解析
- **User-Agent**：用識別性 UA（不含 `Bot` 等被 robots.txt 擋的關鍵字）
- **中文翻譯**：手寫進 `data/prefectures.json`（47 筆固定值）
