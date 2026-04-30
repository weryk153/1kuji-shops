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
