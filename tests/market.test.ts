import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workName, searchQuery, isSingleListing, median, summarize } from '../scraper/market.ts';

test('workName 取一番くじ後第一段', () => {
  assert.equal(workName('一番くじ 機動戦士ガンダム UNIVERSAL CENTURY SAGA INTERLUDE'), '機動戦士ガンダム');
  assert.equal(workName('一番くじ hololive FLOW GLOW'), 'hololive');
  assert.equal(workName('一番くじちょこっと ホイッピ＆ラッピ'), 'ホイッピ＆ラッピ');
  assert.equal(workName('一番くじ 『ペルソナ』シリーズ30th ANNIVERSARY'), 'ペルソナ');
});

test('searchQuery 組合作品、賞、賞品名', () => {
  assert.equal(
    searchQuery('一番くじ 機動戦士ガンダム UNIVERSAL CENTURY SAGA INTERLUDE', 'A賞', 'ザクII BUSTISAN'),
    '一番くじ 機動戦士ガンダム A賞 ザクII BUSTISAN',
  );
  assert.equal(
    searchQuery('一番くじちょこっと 転生したらスライムだった件', 'A賞', 'ぬいぐるみマスコット'),
    '一番くじちょこっと 転生したらスライムだった件 A賞 ぬいぐるみマスコット',
  );
});

test('isSingleListing 排除セット、別的賞、ラストワン同捆', () => {
  assert.equal(isSingleListing('一番くじ 機動戦士ガンダム A賞 ザクII BUSTISAN', 'A賞'), true);
  assert.equal(isSingleListing('一番くじ 機動戦士ガンダム A賞 ラストワン賞 ザクII BUSTISAN', 'A賞'), false);
  assert.equal(isSingleListing('一番くじ 機動戦士ガンダム ザクII A賞 ラストワン賞セット', 'A賞'), false);
  assert.equal(isSingleListing('一番くじ ガンダム A賞 B賞 2点', 'A賞'), false);
  assert.equal(isSingleListing('一番くじ ガンダム B賞 ザク', 'A賞'), false);
  assert.equal(isSingleListing('一番くじ ガンダム ラストワン賞 シャア専用ザク', 'ラストワン賞'), true);
  // 全形字母也算
  assert.equal(isSingleListing('一番くじ ガンダム Ａ賞 ザク', 'A賞'), true);
});

test('median 與樣本數不足', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 3);
  assert.equal(median([]), null);
  assert.deepEqual(summarize([{ title: 'A賞 x', price: 1000 }, { title: 'A賞 y', price: 1200 }], 'A賞'), { median: null, n: 2 });
});
