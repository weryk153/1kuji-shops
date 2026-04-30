# 1kuji 店舖查詢工具

依「一番賞 × 都道府縣」查詢 1kuji.com 店舖，產生分享連結與 Google My Maps 用 CSV。

## 開發

需求：Node 20+

```bash
npm install
npm run scrape                   # 跑爬蟲，產出 data/
npm run build                    # 複製 data/ 到 web/data/
npm run serve                    # 本地預覽前端
npm test                         # 跑單元測試
```

## 部署

Cloudflare Pages 連 GitHub repo。Build command: `npm run build`，Output dir: `web`。
GitHub Actions 每日 UTC 03:00 自動跑爬蟲並 commit `data/`。

## 設計文件

`docs/superpowers/specs/2026-04-30-1kuji-mymaps-tool-design.md`
