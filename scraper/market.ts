// Mercari 行情：搜尋字串與結果過濾（純函式，方便測試）

// 「一番くじ 機動戦士ガンダム UNIVERSAL CENTURY …」→「機動戦士ガンダム」
// 作品名取「一番くじ」後的第一段，太長的副標會讓 Mercari 搜不到
export function workName(nameJa: string): string {
  const rest = nameJa.replace(/^一番くじ(ちょこっと|コフレ)?\s*/, '').trim();
  const first = rest.split(/[\s　〜～\-－『』「」〈〉()（）]+/).filter(Boolean)[0] ?? rest;
  return first.length >= 2 ? first : rest.slice(0, 20);
}

// 賞品名太長時只取前段（「ザクII BUSTISAN」保留；長說明截掉）
export function prizeKeyword(name: string): string {
  return name.split(/[\s　]+/).slice(0, 2).join(' ').slice(0, 30);
}

export function searchQuery(nameJa: string, rank: string, prizeName: string): string {
  // 「一番くじちょこっと」等子品牌要留著，否則會混到同作品的一般一番くじ
  const brand = nameJa.match(/^一番くじ(ちょこっと|コフレ)?/)?.[0] ?? '一番くじ';
  return [brand, workName(nameJa), rank, prizeKeyword(prizeName)].filter(Boolean).join(' ');
}

const OTHER_RANK = /(^|[^A-Za-z])([A-Z]{1,2})賞/g;

// 只留「看起來就是這個賞單品」的成交：
// 標題要有目標賞名、不能同時出現別的賞、不能是セット / まとめ / 全種
export function isSingleListing(title: string, rank: string): boolean {
  const t = title.normalize('NFKC');
  if (!t.includes(rank.normalize('NFKC'))) return false;
  if (/セット|まとめ|全種|コンプ|大量|[0-9０-９]+\s*(点|個|体)セット/.test(t)) return false;
  const isLast = /ラストワン/.test(rank);
  if (!isLast && /ラストワン/.test(t)) return false;
  for (const m of t.matchAll(OTHER_RANK)) {
    if (`${m[2]}賞` !== rank) return false;
  }
  return true;
}

export function median(nums: number[]): number | null {
  const a = nums.filter((n) => Number.isFinite(n) && n > 0).sort((x, y) => x - y);
  if (a.length === 0) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

export const MIN_SAMPLES = 3;

export function summarize(listings: Array<{ title: string; price: number }>, rank: string) {
  const prices = listings.filter((l) => isSingleListing(l.title, rank)).map((l) => l.price);
  return { median: prices.length >= MIN_SAMPLES ? median(prices) : null, n: prices.length };
}
