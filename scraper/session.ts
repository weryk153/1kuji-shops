// 站方 WAF 會 403 掉非瀏覽器 UA，故偽裝成一般瀏覽器 (repo: github.com/weryk153/1kuji-shops)
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface Session {
  cookies: string;        // "_bsp_lt_pro_general_sid=...; _foo=..."
  csrf: string;
}

export async function establishSession(): Promise<Session> {
  const res = await fetch('https://1kuji.com/shop_lists', {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`Session bootstrap failed: ${res.status}`);
  const html = await res.text();
  const csrf = html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1];
  if (!csrf) throw new Error('Could not find csrf-token meta tag');
  const setCookies = res.headers.getSetCookie();
  if (setCookies.length === 0) throw new Error('No Set-Cookie returned');
  // 只保留 name=value 部分
  const cookies = setCookies.map((c) => c.split(';')[0]).join('; ');
  return { cookies, csrf };
}

export function apiHeaders(s: Session): HeadersInit {
  return {
    'User-Agent': UA,
    'Cookie': s.cookies,
    'X-CSRF-Token': s.csrf,
    'Content-Type': 'application/json; charset=utf-8',
    'Referer': 'https://1kuji.com/shop_lists',
  };
}

export { UA };
