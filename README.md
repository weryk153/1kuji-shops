# 1kuji 店舖查詢工具

日本一番賞（一番くじ）資訊站，版型參考 kujinone.com：

| 頁面 | 路徑 | 資料 |
|---|---|---|
| 首頁 | `/` | 販售中 / 近日開賣（`data/schedule.json`） |
| 找店 | `/shops?lottery=…` | 店舖地圖（Leaflet + 国土地理院）、附近的店、CSV（`data/shops/*.json`） |
| 發售日曆 | `/schedule` | 官網每月清單 + 價格、取扱店、各賞（`data/schedule.json`） |
| 商品詳細 | `/kuji?id=…` | 各賞一覽 + Mercari 行情（`data/market.json`） |
| 期望值計算 | `/calc?id=…` | 照店頭看板輸入剩餘數，行情預設帶 Mercari 中位數 |
| 找店・台灣 | `/tw?lottery=…` | 官方台灣清單（`data/tw-lineup.json`）＋全家各店剩餘籤數（`data/tw-familymart.json`），每 6 小時 |
| 排名 | `/ranking` | 最高行情賞、售完比例、販售店數（`web/data/stats.json`，建置時產生） |

舊的分享連結 `/?lottery=…` 會自動轉到 `/shops`。

## 設計

- 設計文件：[docs/superpowers/specs/2026-04-30-1kuji-mymaps-tool-design.md](docs/superpowers/specs/2026-04-30-1kuji-mymaps-tool-design.md)
- 實作計畫：[docs/superpowers/plans/2026-04-30-1kuji-mymaps-tool.md](docs/superpowers/plans/2026-04-30-1kuji-mymaps-tool.md)
- 1kuji 資料來源調查：[docs/investigation.md](docs/investigation.md)

## 開發

需求：Node 20+

```bash
npm install
npm run scrape                   # 抓資料 → data/（一番賞、店舖、發售日曆）
npm run scrape:market            # Mercari 成交行情 → data/market.json（需 npx playwright install chromium）
npm run scrape:tw                # 台灣全家一番賞庫存 → data/tw-familymart.json（約 2 分鐘）
npm run scrape:tw-lineup         # 官方台灣清單（即將開賣／販售中）→ data/tw-lineup.json
npm run build                    # data/ → web/data/
npm run serve                    # 本地預覽 http://localhost:3000
npm test                         # 跑單元測試
```

## 部署

### Cloudflare Pages 設定（一次性）

1. 連 GitHub repo
2. Build command: `npm run build`
3. Output directory: `web`
4. Environment variables: 無

每次 push 到 `main` 自動部署。

### GitHub Actions（一次性）

`.github/workflows/scrape.yml` 會：
- 每日 UTC 03:00（JST 12:00）自動跑爬蟲
- 若 `data/` 有變更 → 自動 commit + push（觸發 Cloudflare Pages 重新部署）
- 失敗時 GitHub 寄 email 給 repo owner

`.github/workflows/scrape-tw.yml` 每 6 小時抓一次台灣全家庫存（全家官方地圖 `stamp.family.com.tw/api/maps`，免登入，逐一查 368 個郵遞區號）。

確認 repo 設定 → Actions → General → Workflow permissions 勾「Read and write」。

### 第一次部署

1. Push 到 GitHub
2. 設定 Cloudflare Pages（如上）
3. 進 Actions tab，手動觸發 `scrape` workflow → 等資料 commit 進 main
4. Cloudflare Pages 自動部署，完成後即可使用

## 維運

- 爬蟲壞了：看 GitHub Actions failure email，修 selector / API path
- 1kuji.com 改版：更新 `scraper/fetch-*.ts` 與 `docs/investigation.md`
- 加都道府縣中文翻譯：直接改 `data/prefectures.json`

## 不做的事（YAGNI）

見設計文件 §2「範圍」。
