const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldDeleteShopFile(
  lotteryId: string,
  now: Date,
  activeIds: Set<string>,
  fileMtime: Date
): boolean {
  if (activeIds.has(lotteryId)) return false;
  return now.getTime() - fileMtime.getTime() > SEVEN_DAYS_MS;
}
