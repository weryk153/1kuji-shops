import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeEv } from '../web/ev.js';

test('每抽期望值 = Σ 剩餘數×行情 / 剩餘總數', () => {
  const r = computeEv({
    price: 800,
    prizes: [
      { count: 1, value: 8000 },
      { count: 3, value: 1000 },
      { count: 16, value: 300 },
    ],
  });
  assert.equal(r.remaining, 20);
  assert.equal(r.evPerDraw, (8000 + 3000 + 4800) / 20); // 790
  assert.equal(r.gainPerDraw, 790 - 800);
});

test('全部買下：加上ラストワン賞的價值', () => {
  const r = computeEv({
    price: 800,
    lastOne: 5000,
    prizes: [{ count: 2, value: 3000 }, { count: 8, value: 200 }],
  });
  assert.equal(r.buyAllCost, 8000);
  assert.equal(r.buyAllValue, 6000 + 1600 + 5000);
  assert.equal(r.buyAllGain, 12600 - 8000);
});

test('沒填行情的賞以 0 計、剩 0 抽不會除以零', () => {
  const r = computeEv({ price: 800, prizes: [{ count: 0, value: null }] });
  assert.equal(r.remaining, 0);
  assert.equal(r.evPerDraw, null);
  assert.equal(r.gainPerDraw, null);
  const r2 = computeEv({ price: 800, prizes: [{ count: 4, value: null }] });
  assert.equal(r2.evPerDraw, 0);
  assert.equal(r2.unpriced, 4);
});

test('抽到指定賞：下一抽機率與平均要抽幾次', () => {
  const r = computeEv({ price: 800, prizes: [{ count: 2, value: 1 }, { count: 8, value: 1 }] }, 0);
  assert.equal(r.target.chance, 0.2);
  // 不放回抽，第一張目標出現位置的期望值 = (N+1)/(K+1)
  assert.equal(r.target.expectedDraws, 11 / 3);
});
