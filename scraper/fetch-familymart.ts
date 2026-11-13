// 台灣全家一番賞庫存：逐一用郵遞區號查「造型卡/一番賞地圖」，整理成 data/tw-familymart.json
// 全台約 368 個郵遞區號 = 368 個請求，免登入。
//
// 用法：npm run scrape:tw
//      FM_LIMIT=5 npm run scrape:tw（只查前 5 個郵遞區號，測試用；不寫檔）
import { readFile, writeFile } from 'node:fs/promises';
import { pool } from './pool.ts';
import { FM_PROJECT_CODE, kujiProducts, buildFile, type FmClassification, type FmStore } from './familymart.ts';

const API = 'https://stamp.family.com.tw/api/maps';
const OUT = 'data/tw-familymart.json';
const CONCURRENCY = 3;
const GAP_MS = 200;          // 每個 worker 兩次請求之間的間隔
const MAX_FAIL_RATIO = 0.05; // 失敗超過 5% 就不寫檔，前端沿用上一次的資料
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface Postcode { zip: string; city: string; area: string }
interface ApiResult<T> { code: number; message: string; data: T }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(path: string, body?: unknown): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${API}/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'User-Agent': UA, ...(body ? { 'Content-Type': 'application/json;charset=utf-8' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ApiResult<T>;
      if (json.code !== 1) throw new Error(`API code ${json.code}: ${json.message}`);
      return json.data;
    } catch (e) {
      lastErr = e;
      await sleep(1000 * attempt);
    }
  }
  throw lastErr;
}

async function main() {
  const postcodes = JSON.parse(await readFile(new URL('./tw-postcodes.json', import.meta.url), 'utf8')) as Postcode[];
  const limit = Number(process.env.FM_LIMIT || 0);
  const targets = limit > 0 ? postcodes.slice(0, limit) : postcodes;

  const groups = await call<FmClassification[]>(`MapClassificationInfo?ProjectCode=${FM_PROJECT_CODE}`);
  const products = kujiProducts(groups);
  console.log(`familymart: ${products.size} 款一番賞，查 ${targets.length} 個郵遞區號`);
  if (products.size === 0) throw new Error('分類裡找不到「一番賞」群組，API 可能改版');

  const t0 = Date.now();
  let done = 0;
  const failed: string[] = [];
  const batches = await pool(targets, CONCURRENCY, async (pc) => {
    try {
      const stores = await call<FmStore[]>('MapProductInfo', { ProjectCode: FM_PROJECT_CODE, PostInfo: pc.zip });
      return { city: pc.city, area: pc.area, stores };
    } catch (e) {
      failed.push(`${pc.zip} ${pc.city}${pc.area}: ${(e as Error).message}`);
      return { city: pc.city, area: pc.area, stores: [] };
    } finally {
      done++;
      if (done % 50 === 0) console.log(`  ${done}/${targets.length}`);
      await sleep(GAP_MS);
    }
  });

  const file = buildFile(batches, products, new Date().toISOString());
  console.log(`familymart: ${file.stores.length} 家店有一番賞，${((Date.now() - t0) / 1000).toFixed(0)} 秒，失敗 ${failed.length}`);
  for (const p of file.products) console.log(`  ${p.short.padEnd(12)} ${String(p.stores).padStart(4)} 家 ${String(p.qty).padStart(6)} 籤`);
  for (const f of failed) console.warn(`  ✗ ${f}`);

  if (failed.length > targets.length * MAX_FAIL_RATIO) {
    throw new Error(`失敗 ${failed.length}/${targets.length} 個郵遞區號，超過 ${MAX_FAIL_RATIO * 100}%，不更新 ${OUT}`);
  }
  if (limit > 0) {
    console.log(`FM_LIMIT=${limit}：測試模式，不寫檔`);
    return;
  }
  await writeFile(OUT, JSON.stringify(file) + '\n');
  console.log(`→ ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
