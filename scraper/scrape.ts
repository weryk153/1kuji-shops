import { writeFile, readdir, stat, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { establishSession } from './session.ts';
import { fetchLotteries } from './fetch-lotteries.ts';
import { fetchShops } from './fetch-shops.ts';
import { shouldDeleteShopFile } from './retention.ts';
import { pool } from './pool.ts';
import type { Lottery, LotteriesFile, ShopsFile } from './types.ts';

const DATA_DIR = 'data';
const SHOPS_DIR = join(DATA_DIR, 'shops');

// 開賣日視窗：[today - WINDOW_BEFORE_DAYS, today + WINDOW_AFTER_DAYS]
// 視窗外的 lottery 不爬店舖（也不出現在前端 dropdown）。
const WINDOW_BEFORE_DAYS = 30;
const WINDOW_AFTER_DAYS = 14;
const LOTTERY_CONCURRENCY = 3;

function withinWindow(release_date: string, now: Date): boolean {
  // 全部用 ms timestamp 比，避免 UTC vs JST 在午夜 boundary 差一天
  const releaseMs = new Date(release_date + 'T00:00:00+09:00').getTime();
  const nowMs = now.getTime();
  const dayMs = 86400_000;
  return releaseMs >= nowMs - WINDOW_BEFORE_DAYS * dayMs
      && releaseMs <= nowMs + WINDOW_AFTER_DAYS * dayMs;
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

  // 對每個視窗內 lottery 並行抓店舖
  let failed = 0;
  await pool(lotteries, LOTTERY_CONCURRENCY, async (lottery) => {
    console.log(`fetching shops for ${lottery.id} (product_id=${lottery.product_id})...`);
    const t = Date.now();
    try {
      const shops = await fetchShops(lottery, session);
      const file: ShopsFile = {
        lottery_id: lottery.id,
        scraped_at: new Date().toISOString(),
        shops,
      };
      // 不縮排，省 ~50% raw 大小（gzip 後差距小，但下載完到瀏覽器解析速度有差）
      await writeFile(
        join(SHOPS_DIR, `${lottery.id}.json`),
        JSON.stringify(file) + '\n'
      );
      console.log(`  -> ${lottery.id}: ${shops.length} shops in ${((Date.now() - t) / 1000).toFixed(0)}s`);
    } catch (err) {
      console.warn(`  ! ${lottery.id} failed: ${(err as Error).message}`);
      failed++;
      process.exitCode = 1;
    }
  });

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

  if (failed > 0) {
    console.log(`done with ${failed} failure(s).`);
  } else {
    console.log('done.');
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
