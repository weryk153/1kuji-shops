import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlToSlug } from '../scraper/slug.ts';

test('取 path 最後段', () => {
  assert.equal(
    urlToSlug('https://1kuji.com/products/dragonball-vol5'),
    'dragonball-vol5'
  );
});

test('忽略 query string', () => {
  assert.equal(
    urlToSlug('https://1kuji.com/products/jujutsu-kaisen-08?ref=top'),
    'jujutsu-kaisen-08'
  );
});

test('忽略 trailing slash', () => {
  assert.equal(
    urlToSlug('https://1kuji.com/products/onepiece-vol12/'),
    'onepiece-vol12'
  );
});

test('non-ASCII 字元 → percent-encode 解碼後保留小寫 ASCII，其他 fallback 到 hash', () => {
  // 例如 /products/ドラゴンボール → 解碼後非 ASCII，fallback 為 8 碼 hash
  const slug = urlToSlug('https://1kuji.com/products/' + encodeURIComponent('ドラゴンボール'));
  assert.match(slug, /^[a-f0-9]{8}$/);
});

test('純路徑無 host 也能 work', () => {
  assert.equal(urlToSlug('/products/some-lottery'), 'some-lottery');
});
