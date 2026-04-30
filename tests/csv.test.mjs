import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCsv, csvEscape, generateFilename } from '../web/csv.js';

test('generateCsv 基本欄位', () => {
  const csv = generateCsv([
    { name: 'ローソン', address: '東京都渋谷区道玄坂2-1-1' },
  ]);
  assert.equal(
    csv,
    'Name,Address\r\nローソン,東京都渋谷区道玄坂2-1-1'
  );
});

test('csvEscape 含逗號要包雙引號', () => {
  assert.equal(csvEscape('a,b'), '"a,b"');
});

test('csvEscape 含雙引號要 escape', () => {
  assert.equal(csvEscape('he said "hi"'), '"he said ""hi"""');
});

test('csvEscape 含換行要包雙引號', () => {
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
});

test('generateFilename 標準 case', () => {
  const lottery = { name_ja: '一番くじ ドラゴンボール Vol.5', release_date: '2026-05-15' };
  const pref = { name_ja: '東京都' };
  assert.equal(
    generateFilename(lottery, pref),
    '一番くじ_ドラゴンボール Vol.5_東京都_2026-05-15発売_店舗リスト.csv'
  );
});

test('generateFilename 過濾 Windows 不合法字元', () => {
  const lottery = { name_ja: 'A/B:C*D?E', release_date: '2026-05-15' };
  const pref = { name_ja: '東京都' };
  assert.equal(
    generateFilename(lottery, pref),
    '一番くじ_A_B_C_D_E_東京都_2026-05-15発売_店舗リスト.csv'
  );
});
