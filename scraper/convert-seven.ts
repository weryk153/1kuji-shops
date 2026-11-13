// openpoint-imap-research 的 inventory.json → data/tw-seven.json
// 用法：npm run convert:seven -- <inventory.json 路徑> [掃描時間 ISO]
import { readFile, writeFile } from 'node:fs/promises';
import { buildSevenFile, type SevenRow } from './seven.ts';

const OUT = 'data/tw-seven.json';

async function main() {
  const [path, at] = process.argv.slice(2);
  if (!path) throw new Error('用法：npm run convert:seven -- <inventory.json> [掃描時間]');
  const rows = JSON.parse(await readFile(path, 'utf8')) as SevenRow[];
  const map = JSON.parse(await readFile(new URL('./tw-seven-map.json', import.meta.url), 'utf8')) as Record<string, string>;
  const lineup = JSON.parse(await readFile('data/tw-lineup.json', 'utf8'));
  const { file, unmapped } = buildSevenFile(rows, map, [...lineup.upcoming, ...lineup.released], at || new Date().toISOString());
  if (file.stores.length === 0) throw new Error('沒有任何 7-11 一番賞門市，掃描結果可能有問題，不更新');
  for (const n of unmapped) console.warn(`  ? 沒有對到官方台灣清單：${n}——在 scraper/tw-seven-map.json 補一行`);
  console.log(`seven: ${file.products.length} 款、${file.stores.length} 家門市`);
  for (const p of file.products) console.log(`  ${p.short.padEnd(16)} ${String(p.stores).padStart(4)} 家 ${String(p.qty).padStart(6)} 籤 ${p.jp_id ?? '（未對照）'}`);
  await writeFile(OUT, JSON.stringify(file) + '\n');
  console.log(`→ ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
