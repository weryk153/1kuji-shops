// 下載並簡化日本地圖資料
// - web/geo/japan.geojson         47 都道府県（dataofjapan/land）
// - web/geo/cities/XX.geojson     各縣的市区町村（合併 niiyz/JapanCityGeoJson 的 per-city files）
//
// 用 git clone（shallow + sparse） 取得 niiyz repo，不依賴 GitHub REST API（避開 60 req/hr 限制）。

import { mkdir, writeFile, stat, rm, readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = 'web/geo';
const REPO_URL = 'https://github.com/niiyz/JapanCityGeoJson.git';
const SIMPLIFY_PCT = '5%';

async function main() {
  const TMP = join(tmpdir(), `fetch-geo-${process.pid}`);
  await mkdir(`${OUT}/cities`, { recursive: true });
  await mkdir(TMP, { recursive: true });

  console.log('[1/3] japan.geojson（47 都道府県）');
  const japanRaw = `${TMP}/japan_raw.geojson`;
  await download(
    'https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson',
    japanRaw
  );
  runMapshaper(japanRaw, `${OUT}/japan.geojson`);
  console.log(`  -> ${await size(`${OUT}/japan.geojson`)} bytes`);

  console.log('[2/3] git clone niiyz/JapanCityGeoJson（shallow, sparse）...');
  const repoDir = `${TMP}/niiyz`;
  cloneShallowSparse(REPO_URL, repoDir, ['geojson']);

  console.log('[3/3] 合併 + 簡化各縣 cities');
  for (let n = 1; n <= 47; n++) {
    const pref = String(n).padStart(2, '0');
    const prefDir = `${repoDir}/geojson/${pref}`;
    let cityFiles: string[];
    try {
      cityFiles = (await readdir(prefDir))
        .filter((f) => /^\d{5}\.json$/.test(f))
        .map((f) => join(prefDir, f));
    } catch {
      console.log(`  ${pref}: (目錄不存在)`);
      continue;
    }
    if (cityFiles.length === 0) {
      console.log(`  ${pref}: 0 cities`);
      continue;
    }

    const features: unknown[] = [];
    for (const path of cityFiles) {
      const text = await readFile(path, 'utf8');
      const data = JSON.parse(text) as { type?: string; features?: unknown[] };
      if (data.features) features.push(...data.features);
      else if (data.type === 'Feature') features.push(data);
    }

    const fc = { type: 'FeatureCollection', features };
    const rawPath = `${TMP}/${pref}.geojson`;
    await writeFile(rawPath, JSON.stringify(fc));
    runMapshaper(rawPath, `${OUT}/cities/${pref}.geojson`);
    console.log(
      `  ${pref}: ${cityFiles.length} cities -> ${await size(`${OUT}/cities/${pref}.geojson`)} bytes`
    );
  }

  await rm(TMP, { recursive: true, force: true });
  console.log('done.');
}

function cloneShallowSparse(url: string, dest: string, includePaths: string[]) {
  // git clone --filter=blob:none --no-checkout，再 sparse-checkout 限定路徑
  const r1 = spawnSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', url, dest], {
    stdio: 'inherit',
  });
  if (r1.status !== 0) throw new Error('git clone 失敗');

  const r2 = spawnSync('git', ['-C', dest, 'sparse-checkout', 'init', '--cone'], { stdio: 'inherit' });
  if (r2.status !== 0) throw new Error('sparse-checkout init 失敗');

  const r3 = spawnSync('git', ['-C', dest, 'sparse-checkout', 'set', ...includePaths], { stdio: 'inherit' });
  if (r3.status !== 0) throw new Error('sparse-checkout set 失敗');

  const r4 = spawnSync('git', ['-C', dest, 'checkout'], { stdio: 'inherit' });
  if (r4.status !== 0) throw new Error('git checkout 失敗');
}

async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

function runMapshaper(input: string, output: string) {
  const r = spawnSync(
    'npx',
    [
      '--yes',
      'mapshaper',
      input,
      '-simplify',
      SIMPLIFY_PCT,
      'keep-shapes',
      '-o',
      'precision=0.0001',
      'force',
      output,
    ],
    { stdio: 'pipe' }
  );
  if (r.status !== 0) {
    throw new Error(`mapshaper 失敗 ${input}: ${r.stderr.toString()}`);
  }
}

async function size(path: string): Promise<number> {
  return (await stat(path)).size;
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
