import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseListing, parseDetail, parseJaDate } from '../scraper/parse-products.ts';

const listing = readFileSync('tests/fixtures/products-list-2026-11.html', 'utf8');
const detail = readFileSync('tests/fixtures/product-onep103.html', 'utf8');

test('parseJaDate 解日期與時間', () => {
  assert.deepEqual(parseJaDate('2026年11月05日(木)より順次発売予定'), { date: '2026-11-05', time: null });
  assert.deepEqual(parseJaDate('2026年11月05日(木)17:00より販売開始予定'), { date: '2026-11-05', time: '17:00' });
  assert.equal(parseJaDate('発売時期未定'), null);
});

test('parseListing 解出每月清單', () => {
  const items = parseListing(listing);
  assert.equal(items.length, 17);
  const first = items[0];
  assert.equal(first.id, 'gundam_ucsi');
  assert.equal(first.name_ja, '一番くじ 機動戦士ガンダム UNIVERSAL CENTURY SAGA INTERLUDE');
  assert.equal(first.category, '一番くじ');
  assert.equal(first.shop_date, '2026-11-05');
  assert.equal(first.online_at, '2026-11-05T17:00:00+09:00');
  assert.match(first.image_url, /^https:\/\/assets\.1kuji\.com\/.+\.webp$/);
  // slug 不重複
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
});

test('parseDetail 解價格、取扱店、各賞', () => {
  const d = parseDetail(detail);
  assert.equal(d.price, 790);
  assert.equal(d.banner_url, 'https://assets.1kuji.com/uploads/product/top_banner/10709/e138f97f-2add-4fc5-b677-743e57b34b32.webp');
  assert.equal(d.stores, 'セブン‐イレブン店舗、イトーヨーカドー店舗、ゆめタウン店舗、麦わらストアなど');
  assert.equal(d.prizes.length, 11);
  assert.deepEqual(d.prizes[0], {
    rank: 'A賞',
    name: 'モンキー・D・ルフィ MASTERLISE EXPIECE',
    kinds: 1,
    size: '約13cm',
    image_url: 'https://assets.1kuji.com/uploads/product_item/image/106145/5d144513-457e-4829-8ebf-4ce6e4bf83d0.webp',
  });
  assert.equal(d.prizes.at(-1)!.rank, 'ラストワン賞');
  assert.equal(d.prizes.at(-1)!.name, 'ロキ Revible Moment');
});

test('parseDetail 頁面沒有資料時回空值而不是丟錯', () => {
  const d = parseDetail('<html></html>');
  assert.deepEqual(d, { banner_url: null, price: null, stores: null, prizes: [] });
});

import { scheduleMonths } from '../scraper/fetch-schedule.ts';

test('scheduleMonths 以 JST 月份為準、跨年正確', () => {
  // 2026-11-30 16:00 UTC = 2026-12-01 01:00 JST
  assert.deepEqual(scheduleMonths(new Date('2026-11-30T16:00:00Z')), [
    { year: 2026, month: 11 }, { year: 2026, month: 12 },
    { year: 2027, month: 1 }, { year: 2027, month: 2 },
  ]);
});
