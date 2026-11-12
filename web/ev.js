// 期望值計算（純函式，方便測試）
// input: { price, lastOne?, prizes: [{ count, value }] }
//   count：店頭看板上的剩餘數；value：行情價（日圓，未填為 null）
// targetIndex：想抽的賞在 prizes 的位置（可省略）
export function computeEv({ price, lastOne = null, prizes }, targetIndex = null) {
  let remaining = 0;
  let total = 0;
  let unpriced = 0;
  for (const p of prizes) {
    const c = Math.max(0, Math.floor(Number(p.count) || 0));
    remaining += c;
    if (Number.isFinite(p.value)) total += c * p.value;
    else unpriced += c;
  }
  const evPerDraw = remaining > 0 ? total / remaining : null;
  const gainPerDraw = evPerDraw != null && Number.isFinite(price) ? evPerDraw - price : null;
  const buyAllCost = Number.isFinite(price) ? remaining * price : null;
  const buyAllValue = total + (Number.isFinite(lastOne) && remaining > 0 ? lastOne : 0);
  const buyAllGain = buyAllCost != null ? buyAllValue - buyAllCost : null;

  let target = null;
  if (targetIndex != null && prizes[targetIndex] && remaining > 0) {
    const k = Math.max(0, Math.floor(Number(prizes[targetIndex].count) || 0));
    target = {
      chance: k / remaining,
      // 不放回抽：第一張目標出現位置的期望值
      expectedDraws: k > 0 ? (remaining + 1) / (k + 1) : null,
    };
  }
  return { remaining, evPerDraw, gainPerDraw, buyAllCost, buyAllValue, buyAllGain, unpriced, target };
}
