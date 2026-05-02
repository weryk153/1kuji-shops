import type { Shop, Lottery, Prefecture } from './types.ts';
import { addressToPrefectureCode } from './prefecture.ts';
import { apiHeaders, type Session } from './session.ts';
import { pool } from './pool.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prefectures: Prefecture[] = JSON.parse(
  readFileSync(join(__dirname, '../data/prefectures.json'), 'utf8')
);

const THROTTLE_MS = 1000;
const PREF_CONCURRENCY = 4;

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
  const perPref = await pool(prefectures, PREF_CONCURRENCY, async (pref) => {
    const prefNum = parseInt(pref.code, 10); // "13" → 13
    const cities = await fetchCities(lottery.product_id, prefNum, session);
    const found: Shop[] = [];
    for (const city of cities) {
      if (city.count === 0) continue;
      await sleep(THROTTLE_MS);
      const shops = await fetchCityShops(lottery.product_id, city.code, session);
      for (const s of shops) {
        found.push({
          name: s.name,
          address: s.address,
          prefecture_code: addressToPrefectureCode(s.address),
          city: city.name,
          city_code: city.code,
          release_datetime: s.active_datetime,
        });
      }
    }
    return found;
  });
  return perPref.flat();
}

async function fetchCities(
  productId: number,
  pref: number,
  session: Session
): Promise<Array<{ name: string; code: string; count: number }>> {
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
      return { name: m[1], count: parseInt(m[2], 10), code: m[3] };
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
