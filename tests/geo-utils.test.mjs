import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestShops } from '../web/geo-utils.js';

const here = { lat: 35.6812, lon: 139.7671 }; // 東京駅

const shops = [
  { name: 'far', lat: 35.7295, lon: 139.7109 },      // 池袋 ~7km
  { name: 'near', lat: 35.6846, lon: 139.7660 },     // ~400m
  { name: 'mid', lat: 35.6595, lon: 139.7005 },      // 渋谷 ~6.5km
  { name: 'nocoord', lat: null, lon: null },
  { name: 'soldout-near', lat: 35.6815, lon: 139.7670, sellout_flag: 1 },
];

test('nearestShops 依距離由近到遠，售完排最後，無座標略過', () => {
  const r = nearestShops(shops, here, 10);
  assert.deepEqual(r.map((x) => x.shop.name), ['near', 'mid', 'far', 'soldout-near']);
  assert.ok(r[0].km > 0.3 && r[0].km < 0.5);
});

test('nearestShops 只取前 limit 筆', () => {
  const r = nearestShops(shops, here, 2);
  assert.deepEqual(r.map((x) => x.shop.name), ['near', 'mid']);
});

test('nearestShops 沒有位置回空陣列', () => {
  assert.deepEqual(nearestShops(shops, null, 5), []);
});
