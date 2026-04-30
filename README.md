# 1kuji 店舖查詢工具

依「一番賞 × 都道府縣」查詢 1kuji.com 店舖，產生分享連結與 Google My Maps 用 CSV。

## 設計

- 設計文件：[docs/superpowers/specs/2026-04-30-1kuji-mymaps-tool-design.md](docs/superpowers/specs/2026-04-30-1kuji-mymaps-tool-design.md)
- 實作計畫：[docs/superpowers/plans/2026-04-30-1kuji-mymaps-tool.md](docs/superpowers/plans/2026-04-30-1kuji-mymaps-tool.md)
- 1kuji 資料來源調查：[docs/investigation.md](docs/investigation.md)

## 開發

需求：Node 20+

```bash
npm install
npm run scrape                   # 抓資料 → data/
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
