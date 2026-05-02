// 日系連鎖店名 → 通用名稱（給台灣使用者更好辨認）
// 只翻譯品牌前綴，後面的分店地名保留日文（地圖搜尋仍精準）
const BRANDS = [
  ['セブン-イレブン', '7-Eleven'],
  ['セブンイレブン', '7-Eleven'],
  ['ファミリーマート', 'FamilyMart'],
  ['ローソンストア100', 'Lawson Store 100'],
  ['ローソン', 'Lawson'],
  ['ミニストップ', 'Ministop'],
  ['デイリーヤマザキ', 'Daily Yamazaki'],
  ['ヤマザキデイリーストアー', 'Yamazaki Daily'],
  ['セイコーマート', 'Seicomart'],
  ['アニメイト', 'Animate'],
  ['ゲオ', 'GEO'],
  ['ビックカメラ', 'Bic Camera'],
  ['ヨドバシカメラ', 'Yodobashi Camera'],
  ['ドン・キホーテ', 'Don Quijote'],
  ['ドンキホーテ', 'Don Quijote'],
  ['イトーヨーカドー', 'Ito-Yokado'],
  ['イオンモール', 'AEON Mall'],
  ['イオン', 'AEON'],
  ['ダイエー', 'Daiei'],
  ['まんだらけ', 'Mandarake'],
  ['駿河屋', 'Suruga-ya'],
  ['らしんばん', 'Lashinbang'],
  ['ホビーゾーン', 'Hobby Zone'],
  ['ホビーステーション', 'Hobby Station'],
  ['キャラデパ', 'Chara Depa'],
  ['マツモトキヨシ', 'Matsumoto Kiyoshi'],
  ['ココカラファイン', 'Cocokara Fine'],
  ['ツルハドラッグ', 'Tsuruha Drug'],
  ['サンドラッグ', 'Sun Drug'],
  ['くまざわ書店', 'Kumazawa Books'],
  ['紀伊國屋書店', '紀伊國屋書店'],
  ['ヴィレッジヴァンガード', 'Village Vanguard'],
  ['ヴィレッジバンガード', 'Village Vanguard'],
  ['キデイランド', 'Kiddy Land'],
  ['トイザらス', 'Toys"R"Us'],
];

export function translateShopName(name) {
  if (!name) return name;
  for (const [ja, zh] of BRANDS) {
    if (name.startsWith(ja)) return zh + name.slice(ja.length);
  }
  return name;
}
