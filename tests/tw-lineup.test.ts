import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLineupHtml } from '../scraper/fetch-tw-lineup.ts';

test('parseLineupHtml 讀官方台灣清單的商品卡', () => {
  const html = `<section><ul class="itemList" id="product_list"><li><a href="/areas/tw/products/kimetsu31"><img src="https://assets.1kuji.com/a.webp" alt="" loading="lazy" /><div class="txtCol"><p class="itemName">一番くじ 鬼滅の刃 ～兄妹の鬼～</p></div></a></li><li><a href="/areas/tw/products/disney_toy9"><img src="https://assets.1kuji.com/b.webp" alt="" /><div class="txtCol"><p class="itemName">一番くじ 〈トイ・ストーリー〉Toys&#39; Glorious Memories</p></div></a></li></ul><p class="more">`;
  assert.deepEqual(parseLineupHtml(html), [
    { id: 'kimetsu31', image_url: 'https://assets.1kuji.com/a.webp', name_ja: '一番くじ 鬼滅の刃 ～兄妹の鬼～' },
    { id: 'disney_toy9', image_url: 'https://assets.1kuji.com/b.webp', name_ja: "一番くじ 〈トイ・ストーリー〉Toys' Glorious Memories" },
  ]);
  assert.deepEqual(parseLineupHtml('<html>改版了</html>'), []);
});
