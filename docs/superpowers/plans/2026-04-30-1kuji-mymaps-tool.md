# 1kuji 店舖查詢工具 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出一個讓使用者依「一番賞 × 都道府縣」查詢 1kuji.com 店舖、產生分享連結與 Google My Maps 用 CSV 的小型靜態網路工具。

**Architecture:** GitHub Actions 每日跑爬蟲 → 產出 JSON 到 repo → Cloudflare Pages 純靜態前端 fetch JSON、URL 帶查詢參數雙向同步、產生 CSV 給使用者匯入 My Maps。三大元件：`scraper/`（TS + Playwright）、`data/`（JSON）、`web/`（vanilla HTML/JS/CSS）。

**Tech Stack:**
- TypeScript + tsx（直跑 TS，不 build）
- Playwright（chromium，僅 scraper 用，視 Task 1 結果可能改 fetch）
- Node 內建 `node:test`（零 dep 測試）
- Vanilla HTML + JS + CSS（前端，不引框架）
- GitHub Actions（排程）+ Cloudflare Pages（靜態託管）

**Spec：** `docs/superpowers/specs/2026-04-30-1kuji-mymaps-tool-design.md`

---

## File Structure

```
1kuji-shops/
├── package.json                 # Node 20+, scripts, deps
├── tsconfig.json                # ES2022, NodeNext, strict
├── .gitignore                   # node_modules, .DS_Store, web/data/
├── README.md                    # 部署 + 開發說明
│
├── scraper/                     # 爬蟲（TS + tsx）
│   ├── types.ts                 # Shop, Lottery, Prefecture types
│   ├── prefecture.ts            # addressToPrefectureCode()
│   ├── slug.ts                  # urlToSlug()
│   ├── fetch-lotteries.ts       # 抓+解析一番賞清單
│   ├── fetch-shops.ts           # 抓+解析單一一番賞的店舖
│   ├── retention.ts             # 已下檔一番賞 JSON 一週保留邏輯
│   └── scrape.ts                # entry point，協調以上
│
├── tests/                       # node:test 單元測試
│   ├── prefecture.test.ts
│   ├── slug.test.ts
│   ├── retention.test.ts
│   └── fixtures/                # 從 1kuji 截下來的 HTML/JSON 樣本
│
├── data/                        # 爬蟲產出 + 手寫的 prefectures.json
│   ├── prefectures.json         # 手寫 47 筆，幾乎不變
│   ├── lotteries.json           # 爬蟲產出
│   └── shops/<lottery_id>.json  # 爬蟲產出
│
├── web/                         # 前端（純靜態）
│   ├── index.html
│   ├── style.css
│   └── app.js                   # 所有 UI 邏輯（含 CSV 產生、URL 同步）
│
├── scripts/
│   └── build.sh                 # cp -r data web/data
│
├── docs/
│   ├── investigation.md         # Task 1 調查紀錄（API/DOM 分析）
│   └── superpowers/
│       ├── specs/2026-04-30-1kuji-mymaps-tool-design.md
│       └── plans/2026-04-30-1kuji-mymaps-tool.md  ← 本檔
│
└── .github/
    └── workflows/
        └── scrape.yml           # 每日排程 + workflow_dispatch
```

---

## Task 1: 調查 1kuji.com 資料取得路徑

**目的：** spec §11 留下的「API vs Playwright、selectors、分頁」全部在這裡釐清並寫進 `docs/investigation.md`，後續任務才有具體 selector 可寫。

**Files:**
- Create: `docs/investigation.md`
- Create: `tests/fixtures/lotteries-page.html`
- Create: `tests/fixtures/shops-page.html`

- [ ] **Step 1: 用瀏覽器開啟 1kuji.com，開 DevTools Network 面板**

導覽至首頁與 `/products`（或任何顯示「販售中 / 即將開賣」清單的頁面）。觀察：
- 是否有 XHR/Fetch 取得 lottery 清單（JSON / GraphQL 端點）
- 是否一切都 SSR 進 HTML

- [ ] **Step 2: 從首頁進入店舖搜尋頁，選一個一番賞，不選都道府縣，按搜尋**

觀察：
- 是否有 XHR 端點回傳店舖陣列
- 若有：記下 URL、method、payload、response schema
- 若無：右鍵「另存頁面為 HTML」存到 `tests/fixtures/shops-page.html`，找出店家卡片的 selector

- [ ] **Step 3: 同樣存一份一番賞清單頁面為 `tests/fixtures/lotteries-page.html`**

- [ ] **Step 4: 檢查 robots.txt**

```bash
curl https://1kuji.com/robots.txt
```

確認 `/shop_lists` 與 lottery 清單路徑沒被 disallow。若被擋則停止此計畫並回報。

- [ ] **Step 5: 確認分頁機制**

- 若一番賞店舖在單一日本全國查詢時筆數可能上百，看是否有分頁 / 滾動載入 / 隱藏 limit 參數
- 寫進 `docs/investigation.md`

- [ ] **Step 6: 寫 `docs/investigation.md`**

內容必須包含：
- 一番賞清單來源（URL + 取得方式：API or DOM scrape）
- 一番賞清單欄位對應（HTML selector / JSON path → `Lottery.id`、`name_ja`、`release_date`、`image_url`、`source_url`）
- 店舖清單來源（同上）
- 店舖清單欄位對應（→ `Shop.name`、`address`、`release_datetime`）
- 分頁/limit 處理方式
- robots.txt 結果
- **關鍵決策：選 API 還是 Playwright**（API 優先，找不到才退回 Playwright）

- [ ] **Step 7: Commit**

```bash
git add docs/investigation.md tests/fixtures/
git commit -m "docs: 1kuji 資料取得路徑調查紀錄"
```

---

## Task 2: 專案骨架（package.json、tsconfig、gitignore、README skeleton）

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: 建立 `package.json`**

```json
{
  "name": "1kuji-shops",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "scrape": "tsx scraper/scrape.ts",
    "test": "tsx --test tests/*.test.ts",
    "build": "bash scripts/build.sh",
    "serve": "npx serve web"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0"
  }
}
```

> **Note：** Task 1 調查確認用純 `fetch`，不需要 `playwright`。Node 20+ `fetch` 內建。

- [ ] **Step 2: 建立 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": ["scraper/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: 建立 `.gitignore`**

```
node_modules/
.DS_Store
web/data/
*.log
```

`web/data/` 是 build 產物（從 `data/` 複製），不入版控。

- [ ] **Step 4: 建立 `README.md` 骨架**

```markdown
# 1kuji 店舖查詢工具

依「一番賞 × 都道府縣」查詢 1kuji.com 店舖，產生分享連結與 Google My Maps 用 CSV。

## 開發

需求：Node 20+

\`\`\`bash
npm install
npm run scrape                   # 跑爬蟲，產出 data/
npm run build                    # 複製 data/ 到 web/data/
npm run serve                    # 本地預覽前端
npm test                         # 跑單元測試
\`\`\`

## 部署

Cloudflare Pages 連 GitHub repo。Build command: `npm run build`，Output dir: `web`。
GitHub Actions 每日 UTC 03:00 自動跑爬蟲並 commit `data/`。

## 設計文件

`docs/superpowers/specs/2026-04-30-1kuji-mymaps-tool-design.md`
```

- [ ] **Step 5: `npm install` 確認安裝成功**

```bash
npm install
```

Expected: 無錯誤，`node_modules/` 建立。

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore README.md
git commit -m "chore: 專案骨架"
```

---

## Task 3: 共用型別

**Files:**
- Create: `scraper/types.ts`

- [ ] **Step 1: 寫 `scraper/types.ts`**

```typescript
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
  release_datetime: string; // ISO 8601 with JST offset
}

export interface ShopsFile {
  lottery_id: string;
  scraped_at: string;
  shops: Shop[];
}
```

- [ ] **Step 2: TypeScript 檢查**

```bash
npx tsc --noEmit
```

Expected: 無錯誤。

- [ ] **Step 3: Commit**

```bash
git add scraper/types.ts
git commit -m "feat: 共用型別"
```

---

## Task 4: 都道府縣靜態資料（`data/prefectures.json`）

**Files:**
- Create: `data/prefectures.json`

- [ ] **Step 1: 建立 `data/prefectures.json`**

```json
[
  { "code": "01", "name_ja": "北海道", "name_zh": "北海道" },
  { "code": "02", "name_ja": "青森県", "name_zh": "青森縣" },
  { "code": "03", "name_ja": "岩手県", "name_zh": "岩手縣" },
  { "code": "04", "name_ja": "宮城県", "name_zh": "宮城縣" },
  { "code": "05", "name_ja": "秋田県", "name_zh": "秋田縣" },
  { "code": "06", "name_ja": "山形県", "name_zh": "山形縣" },
  { "code": "07", "name_ja": "福島県", "name_zh": "福島縣" },
  { "code": "08", "name_ja": "茨城県", "name_zh": "茨城縣" },
  { "code": "09", "name_ja": "栃木県", "name_zh": "栃木縣" },
  { "code": "10", "name_ja": "群馬県", "name_zh": "群馬縣" },
  { "code": "11", "name_ja": "埼玉県", "name_zh": "埼玉縣" },
  { "code": "12", "name_ja": "千葉県", "name_zh": "千葉縣" },
  { "code": "13", "name_ja": "東京都", "name_zh": "東京都" },
  { "code": "14", "name_ja": "神奈川県", "name_zh": "神奈川縣" },
  { "code": "15", "name_ja": "新潟県", "name_zh": "新潟縣" },
  { "code": "16", "name_ja": "富山県", "name_zh": "富山縣" },
  { "code": "17", "name_ja": "石川県", "name_zh": "石川縣" },
  { "code": "18", "name_ja": "福井県", "name_zh": "福井縣" },
  { "code": "19", "name_ja": "山梨県", "name_zh": "山梨縣" },
  { "code": "20", "name_ja": "長野県", "name_zh": "長野縣" },
  { "code": "21", "name_ja": "岐阜県", "name_zh": "岐阜縣" },
  { "code": "22", "name_ja": "静岡県", "name_zh": "靜岡縣" },
  { "code": "23", "name_ja": "愛知県", "name_zh": "愛知縣" },
  { "code": "24", "name_ja": "三重県", "name_zh": "三重縣" },
  { "code": "25", "name_ja": "滋賀県", "name_zh": "滋賀縣" },
  { "code": "26", "name_ja": "京都府", "name_zh": "京都府" },
  { "code": "27", "name_ja": "大阪府", "name_zh": "大阪府" },
  { "code": "28", "name_ja": "兵庫県", "name_zh": "兵庫縣" },
  { "code": "29", "name_ja": "奈良県", "name_zh": "奈良縣" },
  { "code": "30", "name_ja": "和歌山県", "name_zh": "和歌山縣" },
  { "code": "31", "name_ja": "鳥取県", "name_zh": "鳥取縣" },
  { "code": "32", "name_ja": "島根県", "name_zh": "島根縣" },
  { "code": "33", "name_ja": "岡山県", "name_zh": "岡山縣" },
  { "code": "34", "name_ja": "広島県", "name_zh": "廣島縣" },
  { "code": "35", "name_ja": "山口県", "name_zh": "山口縣" },
  { "code": "36", "name_ja": "徳島県", "name_zh": "德島縣" },
  { "code": "37", "name_ja": "香川県", "name_zh": "香川縣" },
  { "code": "38", "name_ja": "愛媛県", "name_zh": "愛媛縣" },
  { "code": "39", "name_ja": "高知県", "name_zh": "高知縣" },
  { "code": "40", "name_ja": "福岡県", "name_zh": "福岡縣" },
  { "code": "41", "name_ja": "佐賀県", "name_zh": "佐賀縣" },
  { "code": "42", "name_ja": "長崎県", "name_zh": "長崎縣" },
  { "code": "43", "name_ja": "熊本県", "name_zh": "熊本縣" },
  { "code": "44", "name_ja": "大分県", "name_zh": "大分縣" },
  { "code": "45", "name_ja": "宮崎県", "name_zh": "宮崎縣" },
  { "code": "46", "name_ja": "鹿児島県", "name_zh": "鹿兒島縣" },
  { "code": "47", "name_ja": "沖縄県", "name_zh": "沖繩縣" }
]
```

- [ ] **Step 2: 驗證 JSON 合法**

```bash
node -e "JSON.parse(require('fs').readFileSync('data/prefectures.json'))" && echo OK
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add data/prefectures.json
git commit -m "feat: 47 都道府縣靜態資料"
```

---

## Task 5: 都道府縣偵測函式（TDD）

由地址前綴推算 `prefecture_code`。

**Files:**
- Create: `scraper/prefecture.ts`
- Create: `tests/prefecture.test.ts`

- [ ] **Step 1: 寫失敗測試 `tests/prefecture.test.ts`**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressToPrefectureCode } from '../scraper/prefecture.ts';

test('東京都 → 13', () => {
  assert.equal(addressToPrefectureCode('東京都渋谷区道玄坂2-1-1'), '13');
});

test('大阪府 → 27', () => {
  assert.equal(addressToPrefectureCode('大阪府大阪市中央区難波5-1-60'), '27');
});

test('北海道 → 01', () => {
  assert.equal(addressToPrefectureCode('北海道札幌市中央区南1条西4-1'), '01');
});

test('愛知県 → 23', () => {
  assert.equal(addressToPrefectureCode('愛知県名古屋市中区錦3丁目17-15'), '23');
});

test('鹿児島県 → 46', () => {
  assert.equal(addressToPrefectureCode('鹿児島県鹿児島市東千石町1-38'), '46');
});

test('沖縄県 → 47', () => {
  assert.equal(addressToPrefectureCode('沖縄県那覇市久茂地3-1-1'), '47');
});

test('地址沒有都道府縣前綴時拋例外', () => {
  assert.throws(() => addressToPrefectureCode('渋谷区道玄坂2-1-1'));
});

test('空字串拋例外', () => {
  assert.throws(() => addressToPrefectureCode(''));
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npm test
```

Expected: FAIL（找不到模組）

- [ ] **Step 3: 寫實作 `scraper/prefecture.ts`**

```typescript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { PrefectureCode, Prefecture } from './types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prefectures: Prefecture[] = JSON.parse(
  readFileSync(join(__dirname, '../data/prefectures.json'), 'utf8')
);

export function addressToPrefectureCode(address: string): PrefectureCode {
  if (!address) throw new Error('Empty address');
  for (const p of prefectures) {
    if (address.startsWith(p.name_ja)) return p.code;
  }
  throw new Error(`No prefecture prefix in address: ${address}`);
}
```

> **Note：** 用 `readFileSync` 而非 import attribute（`with { type: 'json' }` 在不同 Node 版本相容性參差）。前綴比對：47 都道府縣 `name_ja` 無重疊，順序無關。

- [ ] **Step 4: 跑測試確認通過**

```bash
npm test
```

Expected: 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add scraper/prefecture.ts tests/prefecture.test.ts
git commit -m "feat: 地址 → 都道府縣 code 偵測"
```

---

## Task 6: Slug 產生器（TDD）

由 1kuji 商品 URL 產生穩定 slug 給 `Lottery.id` 與檔名。

**Files:**
- Create: `scraper/slug.ts`
- Create: `tests/slug.test.ts`

- [ ] **Step 1: 寫失敗測試 `tests/slug.test.ts`**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlToSlug } from '../scraper/slug.ts';

test('取 path 最後段', () => {
  assert.equal(
    urlToSlug('https://1kuji.com/products/dragonball-vol5'),
    'dragonball-vol5'
  );
});

test('忽略 query string', () => {
  assert.equal(
    urlToSlug('https://1kuji.com/products/jujutsu-kaisen-08?ref=top'),
    'jujutsu-kaisen-08'
  );
});

test('忽略 trailing slash', () => {
  assert.equal(
    urlToSlug('https://1kuji.com/products/onepiece-vol12/'),
    'onepiece-vol12'
  );
});

test('non-ASCII 字元 → percent-encode 解碼後保留小寫 ASCII，其他 fallback 到 hash', () => {
  // 例如 /products/ドラゴンボール → 解碼後非 ASCII，fallback 為 8 碼 hash
  const slug = urlToSlug('https://1kuji.com/products/' + encodeURIComponent('ドラゴンボール'));
  assert.match(slug, /^[a-f0-9]{8}$/);
});

test('純路徑無 host 也能 work', () => {
  assert.equal(urlToSlug('/products/some-lottery'), 'some-lottery');
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npm test
```

Expected: FAIL

- [ ] **Step 3: 寫實作 `scraper/slug.ts`**

```typescript
import { createHash } from 'node:crypto';

export function urlToSlug(url: string): string {
  // 取出 path 最後一段（忽略 query / trailing slash / host）
  const cleaned = url.split('?')[0].replace(/\/+$/, '');
  const lastSegment = cleaned.split('/').filter(Boolean).pop() ?? '';
  const decoded = (() => {
    try { return decodeURIComponent(lastSegment); } catch { return lastSegment; }
  })();

  // 只允許小寫 ASCII letters/digits/hyphen
  if (/^[a-z0-9-]+$/.test(decoded)) return decoded;

  // 否則 fallback 為 sha256 前 8 碼
  return createHash('sha256').update(url).digest('hex').slice(0, 8);
}
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npm test
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add scraper/slug.ts tests/slug.test.ts
git commit -m "feat: URL → slug 產生器"
```

---

## Task 7: 一番賞清單抓取（fetch-lotteries + session）

依 `docs/investigation.md` 結論：API path、需 CSRF + cookie、release_date 要二次抓 detail page。

**Files:**
- Create: `scraper/session.ts`（CSRF + cookie helper，T7 與 T8 共用）
- Create: `scraper/fetch-lotteries.ts`

- [ ] **Step 1: 寫 `scraper/session.ts`（建立 session，取 cookie + CSRF token）**

```typescript
const UA = '1kuji-shops-scraper/1.0 (+https://github.com/owner/1kuji-shops)';

export interface Session {
  cookies: string;        // "_bsp_lt_pro_general_sid=...; _foo=..."
  csrf: string;
}

export async function establishSession(): Promise<Session> {
  const res = await fetch('https://1kuji.com/shop_lists', {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`Session bootstrap failed: ${res.status}`);
  const html = await res.text();
  const csrf = html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1];
  if (!csrf) throw new Error('Could not find csrf-token meta tag');
  const setCookies = res.headers.getSetCookie();
  if (setCookies.length === 0) throw new Error('No Set-Cookie returned');
  // 只保留 name=value 部分
  const cookies = setCookies.map((c) => c.split(';')[0]).join('; ');
  return { cookies, csrf };
}

export function apiHeaders(s: Session): HeadersInit {
  return {
    'User-Agent': UA,
    'Cookie': s.cookies,
    'X-CSRF-Token': s.csrf,
    'Content-Type': 'application/json; charset=utf-8',
    'Referer': 'https://1kuji.com/shop_lists',
  };
}

export { UA };
```

> 注意：UA 不能含 `Bot` 等關鍵字（會被 1kuji robots.txt 對多家 AI bot 的 Disallow / 規則打到）。`<owner>` 留實際 GitHub repo URL。

- [ ] **Step 2: 寫 `scraper/fetch-lotteries.ts`**

```typescript
import type { Lottery } from './types.ts';
import { establishSession, apiHeaders, UA, type Session } from './session.ts';

const PRODUCTS_URL = 'https://1kuji.com/shop_lists/products.json';

interface ProductsApiResponse {
  products: Array<{
    id: number;
    name: string;
    show_url: string;
    image_url: string;
  }>;
}

export async function fetchLotteries(session?: Session): Promise<Lottery[]> {
  const s = session ?? (await establishSession());

  const res = await fetch(PRODUCTS_URL, { headers: apiHeaders(s) });
  if (!res.ok) throw new Error(`products.json failed: ${res.status}`);
  const data = (await res.json()) as ProductsApiResponse;
  if (!Array.isArray(data.products) || data.products.length === 0) {
    throw new Error('products.json returned empty list (CSRF/cookie likely missing)');
  }

  // 對每筆 lottery 二次抓 detail page，解 release_date。1 秒一個請求節流。
  const lotteries: Lottery[] = [];
  for (const p of data.products) {
    const release_date = await fetchReleaseDate(p.show_url);
    lotteries.push({
      id: p.show_url,
      product_id: p.id,
      name_ja: p.name,
      release_date,
      image_url: p.image_url,
      source_url: `https://1kuji.com/products/${p.show_url}`,
    });
    await sleep(1000);
  }
  return lotteries;
}

async function fetchReleaseDate(slug: string): Promise<string> {
  const res = await fetch(`https://1kuji.com/products/${slug}`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`detail page failed for ${slug}: ${res.status}`);
  const html = await res.text();
  // <section class="aboutCol"> ... ■発売日：店頭販売：YYYY年MM月DD日 ...
  const m = html.match(
    /<section[^>]*class="aboutCol"[\s\S]*?■発売日：[\s\S]*?(\d{4})年(\d{2})月(\d{2})日/
  );
  if (!m) throw new Error(`could not parse release_date for ${slug}`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
```

- [ ] **Step 3: Smoke test**

建立 `scraper/_smoke.ts`：

```typescript
import { fetchLotteries } from './fetch-lotteries.ts';
const ls = await fetchLotteries();
console.log(`got ${ls.length} lotteries`);
console.log('sample:', ls[0]);
console.log('release_date 範圍:', ls.map((l) => l.release_date).slice(0, 5));
```

```bash
npx tsx scraper/_smoke.ts
rm scraper/_smoke.ts
```

Expected: 約 60 筆，每筆含 `id`（slug，例如 `"medalist"`）、`name_ja`、`release_date`（YYYY-MM-DD）、`image_url`、`source_url`。

- [ ] **Step 4: Commit**

```bash
git add scraper/session.ts scraper/fetch-lotteries.ts
git commit -m "feat: 一番賞清單抓取（含 session + CSRF + detail page release_date）"
```

---

## Task 8: 店舖清單抓取（fetch-shops）

依 `docs/investigation.md` §4：
- `cities.json?product_id=<numeric>&pref=<1..47>` 取該 (lottery, prefecture) 的城市清單（semicolon-delimited string）
- `search.json?product_id=<numeric>&code=<5-digit-city-code>` 取該城市內店舖
- 1 秒節流；空城市清單直接跳過
- **product_id 用 1kuji 的 numeric id（products.json 的 `id` 欄）**，不是 slug
- pref 是整數 1-47，不是 JIS 兩位字串。`prefectures.json` 的 `code`（"01"-"47"）`parseInt` 即可

**Files:**
- Create: `scraper/fetch-shops.ts`

> **前置：** Task 3 已把 `product_id: number` 放進 `Lottery`，Task 7 寫的 `fetch-lotteries.ts` 也應該回傳含 `product_id` 的 Lottery（即 `product_id: p.id`，p 為 products.json 的 entry）。如果 Task 7 沒帶 `product_id`，先回頭補上。

- [ ] **Step 1: 寫 `scraper/fetch-shops.ts`**

```typescript
import type { Shop, Lottery, Prefecture } from './types.ts';
import { addressToPrefectureCode } from './prefecture.ts';
import { apiHeaders, type Session } from './session.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prefectures: Prefecture[] = JSON.parse(
  readFileSync(join(__dirname, '../data/prefectures.json'), 'utf8')
);

const THROTTLE_MS = 1000;

interface CitiesApiResponse {
  cities: string; // "千代田区(1),13101;新宿区(1),13104"
}

interface SearchApiResponse {
  shops: Array<{
    name: string;
    address: string;
    active_datetime: string; // ISO 8601 with JST offset
  }>;
}

export async function fetchShops(lottery: Lottery, session: Session): Promise<Shop[]> {
  const all: Shop[] = [];

  for (const pref of prefectures) {
    const prefNum = parseInt(pref.code, 10); // "13" → 13
    const cities = await fetchCities(lottery.product_id, prefNum, session);
    if (cities.length === 0) continue;
    for (const city of cities) {
      await sleep(THROTTLE_MS);
      const shops = await fetchCityShops(lottery.product_id, city.code, session);
      for (const s of shops) {
        all.push({
          name: s.name,
          address: s.address,
          prefecture_code: addressToPrefectureCode(s.address),
          release_datetime: s.active_datetime,
        });
      }
    }
    await sleep(THROTTLE_MS);
  }

  return all;
}

async function fetchCities(
  productId: number,
  pref: number,
  session: Session
): Promise<Array<{ name: string; code: string }>> {
  const url = `https://1kuji.com/shop_lists/cities.json?product_id=${productId}&pref=${pref}`;
  const res = await fetch(url, { headers: apiHeaders(session) });
  if (!res.ok) throw new Error(`cities.json failed (pref=${pref}): ${res.status}`);
  const data = (await res.json()) as CitiesApiResponse;
  if (!data.cities) return [];
  return data.cities
    .split(';')
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.+)\((\d+)\),(\d+)$/);
      if (!m) throw new Error(`Cannot parse city entry: ${s}`);
      return { name: m[1], code: m[3] };
    });
}

async function fetchCityShops(
  productId: number,
  cityCode: string,
  session: Session
): Promise<SearchApiResponse['shops']> {
  const url = `https://1kuji.com/shop_lists/search.json?product_id=${productId}&code=${cityCode}`;
  const res = await fetch(url, { headers: apiHeaders(session) });
  if (!res.ok) throw new Error(`search.json failed (code=${cityCode}): ${res.status}`);
  const data = (await res.json()) as SearchApiResponse;
  return data.shops ?? [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
```

- [ ] **Step 2: Smoke test（用一個小型一番賞，避免跑太久）**

建立 `scraper/_smoke.ts`：

```typescript
import { establishSession } from './session.ts';
import { fetchLotteries } from './fetch-lotteries.ts';
import { fetchShops } from './fetch-shops.ts';

const session = await establishSession();
const ls = await fetchLotteries(session);
// 拿最後一筆當 smoke test（通常規模小、不會跑太久）
const small = ls[ls.length - 1];
console.log(`testing ${small.id} (${small.name_ja})`);
const t = Date.now();
const shops = await fetchShops(small, session);
console.log(`got ${shops.length} shops in ${((Date.now() - t) / 1000).toFixed(0)}s`);
console.log('sample shop:', shops[0]);
```

```bash
npx tsx scraper/_smoke.ts
rm scraper/_smoke.ts
```

Expected: 印出店舖數（>0）、第一筆 `prefecture_code` 為 "01"-"47"。**該 smoke test 可能跑數分鐘**，這是預期的。

- [ ] **Step 3: Commit**

```bash
git add scraper/fetch-shops.ts scraper/types.ts scraper/fetch-lotteries.ts
git commit -m "feat: 店舖清單抓取（pref × city 兩階段 API）"
```

---

## Task 9: 一週保留邏輯（TDD）

下檔的一番賞 `shops/<id>.json` 保留 7 天再刪。

**Files:**
- Create: `scraper/retention.ts`
- Create: `tests/retention.test.ts`

- [ ] **Step 1: 寫失敗測試 `tests/retention.test.ts`**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldDeleteShopFile } from '../scraper/retention.ts';

const ACTIVE_IDS = new Set(['active-1', 'active-2']);
const NOW = new Date('2026-04-30T00:00:00Z');

test('仍販售中的不刪', () => {
  assert.equal(
    shouldDeleteShopFile('active-1', NOW, ACTIVE_IDS, new Date('2026-04-29T00:00:00Z')),
    false
  );
});

test('下檔但 fileMtime 在 7 天內 → 不刪', () => {
  assert.equal(
    shouldDeleteShopFile('old-1', NOW, ACTIVE_IDS, new Date('2026-04-25T00:00:00Z')),
    false
  );
});

test('下檔且 fileMtime 超過 7 天 → 刪', () => {
  assert.equal(
    shouldDeleteShopFile('old-1', NOW, ACTIVE_IDS, new Date('2026-04-22T00:00:00Z')),
    true
  );
});

test('下檔且剛好 7 天整 → 不刪（採開區間）', () => {
  assert.equal(
    shouldDeleteShopFile('old-1', NOW, ACTIVE_IDS, new Date('2026-04-23T00:00:00Z')),
    false
  );
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npm test
```

- [ ] **Step 3: 寫實作 `scraper/retention.ts`**

```typescript
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldDeleteShopFile(
  lotteryId: string,
  now: Date,
  activeIds: Set<string>,
  fileMtime: Date
): boolean {
  if (activeIds.has(lotteryId)) return false;
  return now.getTime() - fileMtime.getTime() > SEVEN_DAYS_MS;
}
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npm test
```

Expected: 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add scraper/retention.ts tests/retention.test.ts
git commit -m "feat: 下檔一番賞 shops JSON 保留 7 天"
```

---

## Task 10: 爬蟲協調器（scrape.ts entry point）

**Files:**
- Create: `scraper/scrape.ts`

- [ ] **Step 1: 寫實作 `scraper/scrape.ts`**

```typescript
import { writeFile, readdir, stat, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { establishSession } from './session.ts';
import { fetchLotteries } from './fetch-lotteries.ts';
import { fetchShops } from './fetch-shops.ts';
import { shouldDeleteShopFile } from './retention.ts';
import type { Lottery, LotteriesFile, ShopsFile } from './types.ts';

const DATA_DIR = 'data';
const SHOPS_DIR = join(DATA_DIR, 'shops');

// 開賣日視窗：[today - WINDOW_BEFORE_DAYS, today + WINDOW_AFTER_DAYS]
// 視窗外的 lottery 不爬店舖（也不出現在前端 dropdown）。
// 60 個 lottery × 每個 ~3-8 分鐘 → 8-12h 超出 GitHub Actions 6h 限制，必須過濾。
const WINDOW_BEFORE_DAYS = 30;
const WINDOW_AFTER_DAYS = 14;

function withinWindow(release_date: string, now: Date): boolean {
  const d = new Date(release_date + 'T00:00:00+09:00');
  const lo = new Date(now); lo.setUTCDate(lo.getUTCDate() - WINDOW_BEFORE_DAYS);
  const hi = new Date(now); hi.setUTCDate(hi.getUTCDate() + WINDOW_AFTER_DAYS);
  return d >= lo && d <= hi;
}

async function main() {
  await mkdir(SHOPS_DIR, { recursive: true });
  const now = new Date();

  console.log('establishing session...');
  const session = await establishSession();

  console.log('fetching lottery list (and release dates)...');
  const allLotteries = await fetchLotteries(session);
  console.log(`  -> ${allLotteries.length} total`);

  // 過濾到視窗內
  const lotteries: Lottery[] = allLotteries.filter((l) =>
    withinWindow(l.release_date, now)
  );
  console.log(
    `  -> ${lotteries.length} within window [${WINDOW_BEFORE_DAYS}d before, ${WINDOW_AFTER_DAYS}d after]`
  );

  const lotteriesFile: LotteriesFile = {
    scraped_at: now.toISOString(),
    lotteries,
  };
  await writeFile(
    join(DATA_DIR, 'lotteries.json'),
    JSON.stringify(lotteriesFile, null, 2) + '\n'
  );

  // 對每個視窗內 lottery 抓店舖
  for (const lottery of lotteries) {
    console.log(`fetching shops for ${lottery.id} (product_id=${lottery.product_id})...`);
    const t = Date.now();
    try {
      const shops = await fetchShops(lottery, session);
      const file: ShopsFile = {
        lottery_id: lottery.id,
        scraped_at: new Date().toISOString(),
        shops,
      };
      await writeFile(
        join(SHOPS_DIR, `${lottery.id}.json`),
        JSON.stringify(file, null, 2) + '\n'
      );
      console.log(`  -> ${shops.length} shops in ${((Date.now() - t) / 1000).toFixed(0)}s`);
    } catch (err) {
      console.warn(`  ! failed: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  }

  // 清掉超過 7 天且不在窗內的 shops JSON
  const activeIds = new Set(lotteries.map((l) => l.id));
  const files = await readdir(SHOPS_DIR);
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const id = f.replace(/\.json$/, '');
    const path = join(SHOPS_DIR, f);
    const s = await stat(path);
    if (shouldDeleteShopFile(id, now, activeIds, s.mtime)) {
      await unlink(path);
      console.log(`removed stale: ${f}`);
    }
  }

  console.log('done.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
```

> **錯誤處理：**
> - Session / lottery list 失敗 → throw，整個流程結束，**不寫任何檔**（保留舊的）
> - 個別 lottery shop 抓取失敗 → log warning、跳過、`exitCode = 1`，但其他繼續
> - 已寫入的 shops JSON 保留（即便 exit code = 1，前端仍可用）
>
> **保留的 lottery 範圍：** 由 `WINDOW_BEFORE_DAYS` / `WINDOW_AFTER_DAYS` 控制；如果之後想加寬或縮窄，改這兩個常數即可。

- [ ] **Step 2: 端到端跑一次**

```bash
npm run scrape
```

Expected:
- console 輸出進度
- `data/lotteries.json` 出現
- `data/shops/<id>.json` 每個一番賞一個
- 退出碼 0（無錯誤）

- [ ] **Step 3: Commit（含產出資料）**

```bash
git add scraper/scrape.ts data/lotteries.json data/shops/
git commit -m "feat: 爬蟲協調器 + 首次資料"
```

---

## Task 11: GitHub Actions 排程

**Files:**
- Create: `.github/workflows/scrape.yml`

- [ ] **Step 1: 寫 workflow `.github/workflows/scrape.yml`**

```yaml
name: scrape

on:
  schedule:
    - cron: '0 3 * * *'  # 每日 UTC 03:00 (= JST 12:00)
  workflow_dispatch:
  pull_request:
    paths:
      - 'scraper/**'
      - 'data/prefectures.json'
      - 'package.json'

jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 360  # 視窗內預估 30-40 個 lottery × 3-8 分鐘 = 2-5 小時，留 buffer
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm

      - run: npm ci

      - name: Run scraper
        run: npm run scrape

      - name: Commit if data changed (skip on PR)
        if: github.event_name != 'pull_request'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/
          if git diff --staged --quiet; then
            echo "No data changes, skipping commit."
          else
            git commit -m "data: scrape $(date -u +%Y-%m-%d)"
            git push
          fi
```

> **PR 行為：** PR 觸發時跑 dry-run（不 commit），用來驗證爬蟲修改。

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/scrape.yml
git commit -m "ci: 每日爬蟲排程"
```

---

## Task 12: 前端骨架（HTML + CSS）

**Files:**
- Create: `web/index.html`
- Create: `web/style.css`

- [ ] **Step 1: 寫 `web/index.html`**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>一番賞店舖查詢</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>🎯 一番賞店舖查詢</h1>
    <p class="meta">
      資料來源：1kuji.com・最後更新：<span id="scraped-at">載入中…</span>
    </p>
    <p class="stale-warning" id="stale-warning" hidden>⚠️ 資料超過 48 小時未更新</p>
  </header>

  <main>
    <section class="filters">
      <label>
        一番賞
        <select id="lottery-select" disabled>
          <option value="">載入中…</option>
        </select>
      </label>
      <label>
        都道府縣
        <select id="prefecture-select" disabled>
          <option value="">請先選一番賞</option>
        </select>
      </label>
      <div class="actions">
        <button id="copy-link" disabled>📋 複製分享連結</button>
        <button id="download-csv" disabled>⬇ 下載 CSV (Google My Maps 用)</button>
      </div>
    </section>

    <section class="results">
      <p id="status"></p>
      <ul id="shop-list"></ul>
    </section>
  </main>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 寫 `web/style.css`**

```css
:root {
  --bg: #fafafa;
  --fg: #222;
  --muted: #666;
  --accent: #d63;
  --warn: #c80;
  --card-bg: #fff;
  --border: #ddd;
}

* { box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans',
               'Noto Sans CJK TC', 'PingFang TC', sans-serif;
  background: var(--bg);
  color: var(--fg);
  margin: 0;
  padding: 1rem;
  max-width: 720px;
  margin-inline: auto;
}

header h1 { margin: 0; font-size: 1.4rem; }
.meta { color: var(--muted); font-size: 0.85rem; margin: 0.3rem 0; }
.stale-warning { color: var(--warn); font-weight: 600; }

.filters { display: flex; flex-direction: column; gap: 0.6rem; margin: 1.2rem 0; }
.filters label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.9rem; }
.filters select { padding: 0.5rem; font-size: 1rem; border: 1px solid var(--border); border-radius: 4px; }

.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.actions button {
  padding: 0.5rem 0.8rem; font-size: 0.95rem; cursor: pointer;
  border: 1px solid var(--border); background: var(--card-bg); border-radius: 4px;
}
.actions button:disabled { opacity: 0.5; cursor: not-allowed; }
.actions button.success { background: #d4edda; border-color: #b8d8be; }

#status { color: var(--muted); font-size: 0.9rem; }
#shop-list { list-style: none; padding: 0; margin: 0; }
.shop-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.8rem;
  margin-bottom: 0.6rem;
}
.shop-card .name { font-weight: 600; }
.shop-card .address { color: var(--muted); font-size: 0.9rem; margin: 0.2rem 0; }
.shop-card .release { color: var(--muted); font-size: 0.85rem; }
.shop-card .map-link {
  float: right; text-decoration: none; font-size: 1.1rem;
}
```

- [ ] **Step 3: 本地預覽（注意：data/ 還沒複製到 web/data/，下個任務處理）**

```bash
npm run serve
```

開啟瀏覽器看頁面 layout。Expected: 顯示 header + 兩個 disabled 下拉。

- [ ] **Step 4: Commit**

```bash
git add web/index.html web/style.css
git commit -m "feat: 前端 HTML + CSS 骨架"
```

---

## Task 13: 前端應用邏輯（app.js）

**Files:**
- Create: `web/app.js`

> **TDD 註記：** vanilla JS 在瀏覽器跑、無 build step、不引測試框架。本任務以**手動驗證**為主。CSV 產生的純函式於 Task 14 抽出做單元測試。

- [ ] **Step 1: 寫 `web/app.js`（包含資料載入、URL 同步、列表渲染、按鈕行為）**

```javascript
const $ = (id) => document.getElementById(id);
const lotterySelect = $('lottery-select');
const prefectureSelect = $('prefecture-select');
const copyBtn = $('copy-link');
const downloadBtn = $('download-csv');
const statusEl = $('status');
const listEl = $('shop-list');
const scrapedAtEl = $('scraped-at');
const staleWarning = $('stale-warning');

let lotteries = [];
let prefectures = [];
let currentShops = [];      // 全部都道府縣的店舖（fetch 一次）
let currentLotteryId = null;

async function init() {
  try {
    const [lJson, pJson] = await Promise.all([
      fetch('data/lotteries.json').then((r) => r.json()),
      fetch('data/prefectures.json').then((r) => r.json()),
    ]);
    lotteries = lJson.lotteries;
    prefectures = pJson;

    // 顯示更新時間 + 過期警示
    const scrapedAt = new Date(lJson.scraped_at);
    scrapedAtEl.textContent = formatDate(scrapedAt);
    if (Date.now() - scrapedAt.getTime() > 48 * 3600 * 1000) {
      staleWarning.hidden = false;
    }

    populateLotteries();
    populatePrefectures();
    bindEvents();
    restoreFromUrl();
  } catch (err) {
    statusEl.textContent = '資料暫時無法載入，請稍後再試';
    console.error(err);
  }
}

function populateLotteries() {
  lotterySelect.innerHTML = '<option value="">選擇一番賞…</option>';
  for (const l of lotteries) {
    const opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = l.name_ja;
    lotterySelect.appendChild(opt);
  }
  lotterySelect.disabled = false;
}

function populatePrefectures() {
  prefectureSelect.innerHTML = '<option value="">選擇都道府縣…</option>';
  for (const p of prefectures) {
    const opt = document.createElement('option');
    opt.value = p.code;
    opt.textContent = p.name_zh;
    prefectureSelect.appendChild(opt);
  }
}

function bindEvents() {
  lotterySelect.addEventListener('change', onLotteryChange);
  prefectureSelect.addEventListener('change', onPrefectureChange);
  copyBtn.addEventListener('click', onCopyLink);
  downloadBtn.addEventListener('click', onDownloadCsv);
}

async function onLotteryChange() {
  const id = lotterySelect.value;
  prefectureSelect.disabled = !id;
  currentShops = [];
  currentLotteryId = null;

  if (!id) {
    updateUrl();
    render();
    return;
  }
  try {
    statusEl.textContent = '載入店舖資料中…';
    const res = await fetch(`data/shops/${encodeURIComponent(id)}.json`);
    if (!res.ok) {
      statusEl.textContent = '找不到此一番賞，可能已下檔';
      return;
    }
    const data = await res.json();
    currentShops = data.shops;
    currentLotteryId = id;
    statusEl.textContent = '';
    updateUrl();
    render();
  } catch (err) {
    statusEl.textContent = '店舖資料載入失敗';
    console.error(err);
  }
}

function onPrefectureChange() {
  updateUrl();
  render();
}

function render() {
  const prefCode = prefectureSelect.value;
  listEl.innerHTML = '';

  if (!currentLotteryId) {
    statusEl.textContent = '請先選一番賞';
    setActionsEnabled(false);
    return;
  }
  if (!prefCode) {
    statusEl.textContent = '請選擇都道府縣';
    setActionsEnabled(false);
    return;
  }

  const filtered = currentShops.filter((s) => s.prefecture_code === prefCode);
  const prefName = prefectures.find((p) => p.code === prefCode)?.name_zh ?? '';

  if (filtered.length === 0) {
    statusEl.textContent = `${prefName}：目前沒有販售店舖`;
    setActionsEnabled(false);
    return;
  }

  statusEl.textContent = `📍 ${prefName} 共 ${filtered.length} 家店舖`;
  for (const shop of filtered) listEl.appendChild(renderShop(shop));
  setActionsEnabled(true);
}

function renderShop(shop) {
  const li = document.createElement('li');
  li.className = 'shop-card';
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.address)}`;
  li.innerHTML = `
    <a class="map-link" href="${mapUrl}" target="_blank" rel="noopener" title="在 Google 地圖開啟">📍</a>
    <div class="name"></div>
    <div class="address"></div>
    <div class="release"></div>
  `;
  li.querySelector('.name').textContent = shop.name;
  li.querySelector('.address').textContent = shop.address;
  li.querySelector('.release').textContent = `開賣：${formatDateTime(shop.release_datetime)}`;
  return li;
}

function setActionsEnabled(enabled) {
  copyBtn.disabled = !enabled;
  downloadBtn.disabled = !enabled;
}

function updateUrl() {
  const params = new URLSearchParams();
  if (lotterySelect.value) params.set('lottery', lotterySelect.value);
  if (prefectureSelect.value) params.set('prefecture', prefectureSelect.value);
  const q = params.toString();
  history.replaceState(null, '', q ? `?${q}` : window.location.pathname);
}

async function restoreFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const lid = params.get('lottery');
  const pcode = params.get('prefecture');
  if (lid && lotteries.some((l) => l.id === lid)) {
    lotterySelect.value = lid;
    await onLotteryChange();
  }
  if (pcode && prefectures.some((p) => p.code === pcode)) {
    prefectureSelect.value = pcode;
    onPrefectureChange();
  }
}

async function onCopyLink() {
  await navigator.clipboard.writeText(window.location.href);
  copyBtn.textContent = '✓ 已複製';
  copyBtn.classList.add('success');
  setTimeout(() => {
    copyBtn.textContent = '📋 複製分享連結';
    copyBtn.classList.remove('success');
  }, 1500);
}

function onDownloadCsv() {
  const prefCode = prefectureSelect.value;
  const lottery = lotteries.find((l) => l.id === currentLotteryId);
  const pref = prefectures.find((p) => p.code === prefCode);
  if (!lottery || !pref) return;
  const filtered = currentShops.filter((s) => s.prefecture_code === prefCode);
  const csv = generateCsv(filtered);
  const filename = generateFilename(lottery, pref);
  triggerDownload(csv, filename);
}

// CSV / 檔名 / 時間格式 純函式 — Task 14 會抽出來做單元測試
function generateCsv(shops) {
  const rows = [['Name', 'Address']];
  for (const s of shops) rows.push([s.name, s.address]);
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
}
function csvEscape(field) {
  if (/[",\r\n]/.test(field)) return `"${field.replace(/"/g, '""')}"`;
  return field;
}
function generateFilename(lottery, pref) {
  const cleanName = lottery.name_ja.replace(/^一番くじ\s*/, '').replace(/[\\\/:*?"<>|]/g, '_');
  return `一番くじ_${cleanName}_${pref.name_ja}_${lottery.release_date}発売_店舗リスト.csv`;
}
function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
const JST_FMT = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo', hour12: false,
});
function formatDate(d) {
  // 將 ja-JP 的「2026/04/30 12:00」改成「2026-04-30 12:00 JST」
  return JST_FMT.format(d).replace(/\//g, '-') + ' JST';
}
function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.valueOf())) return iso;
  return formatDate(d);
}

init();
```

- [ ] **Step 2: 建立 build script `scripts/build.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
rm -rf web/data
cp -r data web/data
echo "data/ → web/data/ copied"
```

- [ ] **Step 3: 給予執行權限**

```bash
chmod +x scripts/build.sh
```

- [ ] **Step 4: 跑 build 並本地驗證**

```bash
npm run build
npm run serve
```

開瀏覽器：

驗證以下情境（手動點點看，逐一 checkbox）：
- [ ] 頁面開啟顯示「最後更新：YYYY-MM-DD HH:mm」
- [ ] 一番賞下拉填入內容
- [ ] 選一番賞 → 都道府縣下拉變可選
- [ ] 沒選都道府縣 → 顯示「請選擇都道府縣」
- [ ] 選都道府縣 → 顯示「📍 X 共 N 家店舖」+ 列表
- [ ] 列表卡片可點 📍 開新分頁到 Google 地圖（搜尋該地址）
- [ ] 「複製分享連結」→ clipboard 內容包含 `?lottery=...&prefecture=...`
- [ ] 用該分享連結開新分頁 → 兩個下拉自動還原、列表顯示
- [ ] 「下載 CSV」→ 檔名 `一番くじ_<名>_<縣>_<日期>発売_店舗リスト.csv`、內容前兩行如 spec
- [ ] 用記事本/VS Code 開 CSV → UTF-8 無亂碼、無 BOM

- [ ] **Step 5: Commit**

```bash
git add web/app.js scripts/build.sh
git commit -m "feat: 前端應用邏輯（資料載入、URL 同步、CSV 下載）"
```

---

## Task 14: CSV 純函式抽出 + 單元測試

由於 `generateCsv` / `csvEscape` / `generateFilename` 是純函式，可以抽到獨立模組做測試。也方便日後用其他環境呼叫。

**Files:**
- Create: `web/csv.js`
- Create: `tests/csv.test.mjs`
- Modify: `web/app.js`

- [ ] **Step 1: 寫失敗測試 `tests/csv.test.mjs`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCsv, csvEscape, generateFilename } from '../web/csv.js';

test('generateCsv 基本欄位', () => {
  const csv = generateCsv([
    { name: 'ローソン', address: '東京都渋谷区道玄坂2-1-1' },
  ]);
  assert.equal(
    csv,
    'Name,Address\r\nローソン,東京都渋谷区道玄坂2-1-1'
  );
});

test('csvEscape 含逗號要包雙引號', () => {
  assert.equal(csvEscape('a,b'), '"a,b"');
});

test('csvEscape 含雙引號要 escape', () => {
  assert.equal(csvEscape('he said "hi"'), '"he said ""hi"""');
});

test('csvEscape 含換行要包雙引號', () => {
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
});

test('generateFilename 標準 case', () => {
  const lottery = { name_ja: '一番くじ ドラゴンボール Vol.5', release_date: '2026-05-15' };
  const pref = { name_ja: '東京都' };
  assert.equal(
    generateFilename(lottery, pref),
    '一番くじ_ドラゴンボール Vol.5_東京都_2026-05-15発売_店舗リスト.csv'
  );
});

test('generateFilename 過濾 Windows 不合法字元', () => {
  const lottery = { name_ja: 'A/B:C*D?E', release_date: '2026-05-15' };
  const pref = { name_ja: '東京都' };
  assert.equal(
    generateFilename(lottery, pref),
    '一番くじ_A_B_C_D_E_東京都_2026-05-15発売_店舗リスト.csv'
  );
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
node --test tests/csv.test.mjs
```

Expected: FAIL（檔案不存在）

- [ ] **Step 3: 抽出 `web/csv.js`**

```javascript
export function csvEscape(field) {
  if (/[",\r\n]/.test(field)) return `"${field.replace(/"/g, '""')}"`;
  return field;
}

export function generateCsv(shops) {
  const rows = [['Name', 'Address']];
  for (const s of shops) rows.push([s.name, s.address]);
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

export function generateFilename(lottery, pref) {
  const cleanName = lottery.name_ja
    .replace(/^一番くじ\s*/, '')
    .replace(/[\\\/:*?"<>|]/g, '_');
  return `一番くじ_${cleanName}_${pref.name_ja}_${lottery.release_date}発売_店舗リスト.csv`;
}
```

- [ ] **Step 4: 修改 `web/app.js` 改 import 自 `csv.js`**

把 `app.js` 裡的 `csvEscape` / `generateCsv` / `generateFilename` 三個函式刪掉，改在檔案頂端加：

```javascript
import { generateCsv, generateFilename } from './csv.js';
```

- [ ] **Step 5: 更新 `package.json` test script 包含 .mjs**

把 test script 改成（bash brace 展開支援 `.ts` 與 `.mjs`）：

```json
"test": "tsx --test tests/*.test.{ts,mjs}"
```

- [ ] **Step 6: 跑全部測試**

```bash
npm test
```

Expected: 全部通過（prefecture 8 + slug 5 + retention 4 + csv 6 = 23 tests）

- [ ] **Step 7: 重新 build + 瀏覽器驗證 CSV 下載仍正常**

```bash
npm run build
npm run serve
```

點下載 CSV → 驗證內容無誤。

- [ ] **Step 8: Commit**

```bash
git add web/csv.js web/app.js tests/csv.test.mjs package.json
git commit -m "refactor: CSV 純函式抽出並加單元測試"
```

---

## Task 15: README 補完 + 部署設定文件

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 補完 `README.md`**

把骨架版的 README 改成完整版：

```markdown
# 1kuji 店舖查詢工具

依「一番賞 × 都道府縣」查詢 1kuji.com 店舖，產生分享連結與 Google My Maps 用 CSV。

## 設計

- 設計文件：[docs/superpowers/specs/2026-04-30-1kuji-mymaps-tool-design.md](docs/superpowers/specs/2026-04-30-1kuji-mymaps-tool-design.md)
- 實作計畫：[docs/superpowers/plans/2026-04-30-1kuji-mymaps-tool.md](docs/superpowers/plans/2026-04-30-1kuji-mymaps-tool.md)
- 1kuji 資料來源調查：[docs/investigation.md](docs/investigation.md)

## 開發

需求：Node 20+

\`\`\`bash
npm install
npm run scrape                   # 抓資料 → data/
npm run build                    # data/ → web/data/
npm run serve                    # 本地預覽 http://localhost:3000
npm test                         # 跑單元測試
\`\`\`

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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README 完整版（部署 + 維運）"
```

---

## Task 16: 端到端冒煙測試

**Files:** 無新檔。手動驗證整條鏈路。

- [ ] **Step 1: 清乾淨重跑一次**

```bash
rm -rf web/data
npm run scrape
npm run build
npm run serve
```

- [ ] **Step 2: 手動驗證以下情境（全部過才算 done）**

- [ ] 頁面開啟 < 1 秒，下拉填入完整一番賞清單
- [ ] 選一番賞 + 都道府縣 → 列表正確顯示
- [ ] 列表卡片點 📍 → 新分頁 Google 地圖確實顯示該店家位置
- [ ] 複製分享連結 → 貼到新分頁打開 → 還原下拉 + 列表
- [ ] 下載 CSV → 檔名正確、內容兩欄、UTF-8 無 BOM
- [ ] 把 CSV 拖進 Google My Maps（在 mymaps.google.com 建立新地圖 → 匯入）→ 全部地址成功 geocode、地圖上有 pin
- [ ] 故意把 URL 改成 `?lottery=fake` → 顯示「找不到此一番賞」
- [ ] `npm test` 全部通過

- [ ] **Step 3: 若有任何驗證失敗 → 修正後重跑**

- [ ] **Step 4: 全部過了 → 標註 release-ready commit**

```bash
git commit --allow-empty -m "release: v0.1.0 端到端冒煙測試通過"
```

---

## 完成定義

- 所有 Task 1-16 checkbox 完成
- `npm test` 23 tests pass
- 端到端流程跑通（Task 16 驗證項目全綠）
- GitHub Actions 至少手動觸發成功一次
- Cloudflare Pages 部署成功，可從外部 URL 開啟工具

## 驗收後的後續工作（不在本計畫範圍）

- 部署到 Cloudflare Pages 並把 URL 寫進 README
- 邀請朋友試用、收 feedback
- 若使用人數成長到接近免費額度上限再考慮 rate limit
