import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldDeleteShopFile } from '../scraper/retention.ts';

const ACTIVE_IDS = new Set(['active-1', 'active-2']);
const NOW = new Date('2026-04-30T00:00:00Z');

test('仍販售中的不刪', () => {
  assert.equal(
    shouldDeleteShopFile('active-1', NOW, ACTIVE_IDS, new Date('2026-04-29T00:00:00Z')),
    false
  );
});

test('下檔但 fileMtime 在 7 天內 → 不刪', () => {
  assert.equal(
    shouldDeleteShopFile('old-1', NOW, ACTIVE_IDS, new Date('2026-04-25T00:00:00Z')),
    false
  );
});

test('下檔且 fileMtime 超過 7 天 → 刪', () => {
  assert.equal(
    shouldDeleteShopFile('old-1', NOW, ACTIVE_IDS, new Date('2026-04-22T00:00:00Z')),
    true
  );
});

test('下檔且剛好 7 天整 → 不刪（採開區間）', () => {
  assert.equal(
    shouldDeleteShopFile('old-1', NOW, ACTIVE_IDS, new Date('2026-04-23T00:00:00Z')),
    false
  );
});
