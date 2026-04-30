import { createHash } from 'node:crypto';

export function urlToSlug(url: string): string {
  // 取出 path 最後一段（忽略 query / trailing slash / host）
  const cleaned = url.split('?')[0].replace(/\/+$/, '');
  const lastSegment = cleaned.split('/').filter(Boolean).pop() ?? '';
  const decoded = (() => {
    try { return decodeURIComponent(lastSegment); } catch { return lastSegment; }
  })();

  // 只允許小寫 ASCII letters/digits/hyphen
  if (/^[a-z0-9-]+$/.test(decoded)) return decoded;

  // 否則 fallback 為 sha256 前 8 碼
  return createHash('sha256').update(url).digest('hex').slice(0, 8);
}
