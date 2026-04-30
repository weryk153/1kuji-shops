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
