import { Hono } from 'hono';
import type { Env } from '../env';

const favicon = new Hono<{ Bindings: Env }>();

const FETCH_TIMEOUT_MS = 4500;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 天
const UA =
  'Mozilla/5.0 (compatible; PegNavFavicon/1.0; +https://github.com/newbietan/PegNav)';

function normalizeTarget(raw: string | undefined): URL | null {
  if (!raw?.trim()) return null;
  let value = raw.trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname || url.hostname === 'localhost') return null;
    return url;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: 'image/*,text/html,*/*',
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeImage(res: Response): boolean {
  if (!res.ok) return false;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.startsWith('image/')) return true;
  if (ct.includes('icon')) return true;
  // 部分站点不设 Content-Type 或用 octet-stream
  if (ct.includes('octet-stream') || ct === '' || ct.includes('text/plain')) {
    return true;
  }
  return false;
}

function extractIconHrefs(html: string, base: string): string[] {
  const slice = html.slice(0, 120_000);
  const hrefs: string[] = [];
  const re =
    /<link\b[^>]*\brel\s*=\s*["']([^"']*)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(slice)) !== null) {
    const tag = match[0];
    const rel = match[1].toLowerCase();
    if (
      !rel.includes('icon') &&
      !rel.includes('apple-touch-icon') &&
      !rel.includes('shortcut')
    ) {
      continue;
    }
    const hrefMatch =
      /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag) ||
      /\bhref\s*=\s*([^\s>]+)/i.exec(tag);
    if (!hrefMatch?.[1]) continue;
    try {
      hrefs.push(new URL(hrefMatch[1].replace(/^['"]|['"]$/g, ''), base).href);
    } catch {
      // skip bad href
    }
  }

  // href 在 rel 前的写法
  const re2 =
    /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\brel\s*=\s*["']([^"']*)["'][^>]*>/gi;
  while ((match = re2.exec(slice)) !== null) {
    const rel = match[2].toLowerCase();
    if (!rel.includes('icon') && !rel.includes('apple-touch-icon')) continue;
    try {
      hrefs.push(new URL(match[1], base).href);
    } catch {
      // skip
    }
  }

  return [...new Set(hrefs)];
}

async function tryImage(url: string): Promise<Response | null> {
  const res = await fetchWithTimeout(url, {
    headers: { Accept: 'image/*,*/*' },
  });
  if (!res || !looksLikeImage(res)) return null;
  // 再读 body 校验非空
  const buf = await res.arrayBuffer();
  if (!buf.byteLength || buf.byteLength < 16) return null;
  // 明显是 HTML 错误页
  const head = new TextDecoder().decode(buf.slice(0, 32)).toLowerCase();
  if (head.includes('<!doctype') || head.includes('<html')) return null;

  const contentType =
    res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/x-icon';
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': contentType.startsWith('image')
        ? contentType
        : 'image/x-icon',
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function resolveFavicon(target: URL): Promise<Response | null> {
  const origin = target.origin;
  const host = target.hostname;

  // 1) 拉首页，解析 <link rel="icon" ...>
  const page = await fetchWithTimeout(origin + '/', {
    headers: { Accept: 'text/html,application/xhtml+xml,*/*' },
  });
  if (page?.ok) {
    const html = await page.text();
    for (const href of extractIconHrefs(html, origin)) {
      const img = await tryImage(href);
      if (img) return img;
    }
  }

  // 2) 常规路径
  for (const path of ['/favicon.ico', '/favicon.png', '/apple-touch-icon.png']) {
    const img = await tryImage(origin + path);
    if (img) return img;
  }

  // 3) 第三方聚合（服务端拉取，避免浏览器直连失败）
  for (const third of [
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
    `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(origin)}`,
    `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(host)}`,
  ]) {
    const img = await tryImage(third);
    if (img) return img;
  }

  return null;
}

favicon.get('/', async (c) => {
  const raw = c.req.query('url') || c.req.query('domain');
  const target = normalizeTarget(raw);
  if (!target) {
    return c.json({ error: '缺少有效 url 参数' }, 400);
  }

  const cache = caches.default;
  const cacheKey = new Request(
    `https://favicon.pegnav.internal/${target.hostname}`,
    { method: 'GET' },
  );

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const resolved = await resolveFavicon(target);
  if (!resolved) {
    return new Response(null, {
      status: 404,
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // 克隆一份写入边缘缓存（首次访问后加速）
  c.executionCtx.waitUntil(cache.put(cacheKey, resolved.clone()));
  return resolved;
});

export default favicon;
