import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLineupHtml, detectReleases, todayTaipei } from '../scraper/fetch-tw-lineup.ts';

test('parseLineupHtml 讀官方台灣清單的商品卡', () => {
  const html = `<section><ul class="itemList" id="product_list"><li><a href="/areas/tw/products/kimetsu31"><img src="https://assets.1kuji.com/a.webp" alt="" loading="lazy" /><div class="txtCol"><p class="itemName">一番くじ 鬼滅の刃 ～兄妹の鬼～</p></div></a></li><li><a href="/areas/tw/products/disney_toy9"><img src="https://assets.1kuji.com/b.webp" alt="" /><div class="txtCol"><p class="itemName">一番くじ 〈トイ・ストーリー〉Toys&#39; Glorious Memories</p></div></a></li></ul><p class="more">`;
  assert.deepEqual(parseLineupHtml(html), [
    { id: 'kimetsu31', image_url: 'https://assets.1kuji.com/a.webp', name_ja: '一番くじ 鬼滅の刃 ～兄妹の鬼～' },
    { id: 'disney_toy9', image_url: 'https://assets.1kuji.com/b.webp', name_ja: "一番くじ 〈トイ・ストーリー〉Toys' Glorious Memories" },
  ]);
  assert.deepEqual(parseLineupHtml('<html>改版了</html>'), []);
});

test('detectReleases：即將開賣變販售中的記為今天開賣，舊紀錄保留', () => {
  const item = (id: string) => ({ id, name_ja: id, image_url: '' });
  const prev = { scraped_at: '', upcoming: [item('a'), item('b')], released: [item('old')], released_on: { old: '2026-11-05' } };
  assert.deepEqual(
    detectReleases(prev, [item('a'), item('old'), item('c')], '2026-11-19'),
    { old: '2026-11-05', a: '2026-11-19' }, // c 上次不在即將開賣（第一次看到就已開賣）→ 不知道開賣日
  );
  assert.deepEqual(detectReleases(null, [item('a')], '2026-11-19'), {});
});

test('todayTaipei 用台灣時區換日', () => {
  assert.equal(todayTaipei(new Date('2026-11-18T16:30:00Z')), '2026-11-19');
  assert.equal(todayTaipei(new Date('2026-11-18T15:30:00Z')), '2026-11-18');
});
