import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortName, kujiProducts, buildFile, type FmClassification, type FmStore } from '../scraper/familymart.ts';

test('shortName 去掉「一番賞」前綴與「獎籤」後綴，全形轉半形', () => {
  assert.equal(shortName('一番賞七龍珠ＳＢ＿獎籤'), '七龍珠SB');
  assert.equal(shortName('一番賞寶可夢３０ｔｈ＿獎籤'), '寶可夢30th');
  assert.equal(shortName('一番賞機械哥吉拉獎籤'), '機械哥吉拉');
  assert.equal(shortName('一番賞蠟筆小新名場面_獎籤'), '蠟筆小新名場面');
  assert.equal(shortName('一番賞鏈鋸人蕾潔獎籤'), '鏈鋸人蕾潔');
});

const groups: FmClassification[] = [
  { groupCode: '1', groupName: '悠遊卡', categories: [{ categoryCode: '101', categoryName: '造型悠遊卡', products: [{ productCode: 'C1', productName: '卡娜赫拉悠遊卡' }] }] },
  { groupCode: '3', groupName: '一番賞', categories: [
    { categoryCode: '301', categoryName: '七龍珠', products: [{ productCode: 'K1', productName: '一番賞七龍珠ＳＢ＿獎籤' }] },
    { categoryCode: '305', categoryName: '小小兵', products: [{ productCode: 'K2', productName: '一番賞小小兵電影獎籤' }] },
  ] },
  { groupCode: '4', groupName: '樂淘賞', categories: [{ categoryCode: '401', categoryName: '線條小狗', products: [{ productCode: 'L1', productName: '樂淘賞線條小狗獎籤' }] }] },
];

test('kujiProducts 只取一番賞群組', () => {
  const p = kujiProducts(groups);
  assert.deepEqual([...p.keys()], ['K1', 'K2']);
  assert.deepEqual(p.get('K1'), { code: 'K1', name: '一番賞七龍珠SB_獎籤', short: '七龍珠SB', series: '七龍珠' });
});

function store(id: string, items: [string, number][], updateDate = '2026-11-13T10:10:18+08:00'): FmStore {
  return {
    oldPKey: id, name: `全家${id}店`, address: '台北市信義區莊敬路１９０號', latitude: 25.0312345, longitude: 121.5612345, updateDate,
    info: [{ code: '3', name: '一番賞', categories: [{ code: '301', name: 'x', products: items.map(([code, qty]) => ({ code, name: code, qty })) }] }],
  };
}

test('buildFile 去重、只留一番賞、統計有貨門市與籤數', () => {
  const products = kujiProducts(groups);
  const file = buildFile([
    { city: '台北市', area: '信義區', stores: [store('001', [['K1', 30], ['C1', 2]]), store('002', [['K2', 0]]), store('003', [['C1', 5]])] },
    // 同一間店出現在另一個郵遞區號的結果
    { city: '台北市', area: '信義區', stores: [store('001', [['K1', 28]], '2026-11-13T11:00:00+08:00')] },
  ], products, '2026-11-13T03:00:00.000Z');

  assert.deepEqual(file.stores.map((s) => s.id), ['001', '002']); // 003 只有悠遊卡
  assert.deepEqual(file.stores[0].stock, { K1: 28 });
  assert.equal(file.stores[0].address, '台北市信義區莊敬路190號');
  assert.equal(file.stores[0].lat, 25.03123);
  assert.equal(file.source_updated, '2026-11-13T11:00:00+08:00');

  const k1 = file.products.find((p) => p.code === 'K1')!;
  const k2 = file.products.find((p) => p.code === 'K2')!;
  assert.deepEqual([k1.stores, k1.qty], [1, 28]);
  assert.deepEqual([k2.stores, k2.qty], [0, 0]); // 售完不算有貨
  assert.equal(file.products[0].code, 'K1'); // 有貨門市多的排前面
});
