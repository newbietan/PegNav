import { Hono } from 'hono';
import type { Env } from '../env';

const favicon = new Hono<{ Bindings: Env }>();

const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;
const CACHE_VERSION = 'v3';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

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
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function imageResponse(
  body: ArrayBuffer | Uint8Array | string,
  contentType: string,
  ttl = CACHE_TTL_SECONDS,
): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': `public, max-age=${ttl}`,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/** 直接解码 data:image/...;base64,... 或 data:image/...;utf8,... */
function responseFromDataUri(dataUri: string): Response | null {
  const m = /^data:(image\/[a-z0-9.+-]+|image\/svg\+xml)(;charset=[^;]+)?(;base64)?,(.*)$/i.exec(
    dataUri.trim(),
  );
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const isBase64 = Boolean(m[3]);
  const data = m[4];
  try {
    if (isBase64) {
      const binary = atob(data.replace(/\s/g, ''));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      if (bytes.byteLength < 8) return null;
      return imageResponse(bytes, mime);
    }
    const decoded = decodeURIComponent(data);
    if (decoded.length < 8) return null;
    return imageResponse(decoded, mime.includes('svg') ? 'image/svg+xml' : mime);
  } catch {
    return null;
  }
}

function looksLikeImageBytes(buf: ArrayBuffer, contentType: string): boolean {
  if (!buf.byteLength || buf.byteLength < 8) return false;
  const head = new Uint8Array(buf.slice(0, 16));
  const asText = new TextDecoder().decode(head).toLowerCase();
  if (asText.includes('<!doctype') || asText.includes('<html')) return false;

  // magic numbers
  if (head[0] === 0x89 && head[1] === 0x50) return true; // PNG
  if (head[0] === 0xff && head[1] === 0xd8) return true; // JPEG
  if (head[0] === 0x47 && head[1] === 0x49) return true; // GIF
  if (head[0] === 0x52 && head[1] === 0x49) return true; // RIFF/webp
  if (head[0] === 0x00 && head[1] === 0x00 && head[2] === 0x01) return true; // ICO
  if (asText.includes('<svg') || asText.includes('<?xml')) return true;

  const ct = contentType.toLowerCase();
  return ct.startsWith('image/') || ct.includes('icon');
}

function extractIconHrefs(html: string, base: string): string[] {
  const slice = html.slice(0, 200_000);
  const hrefs: string[] = [];

  // 任意顺序的 link 标签
  const re = /<link\b([^>]+)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(slice)) !== null) {
    const attrs = match[1];
    const relM = /\brel\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const rel = (relM?.[1] || '').toLowerCase();
    if (
      !rel.includes('icon') &&
      !rel.includes('apple-touch-icon') &&
      rel !== 'shortcut'
    ) {
      continue;
    }
    const hrefM =
      /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs) ||
      /\bhref\s*=\s*([^\s>]+)/i.exec(attrs);
    if (!hrefM?.[1]) continue;
    const raw = hrefM[1].trim();
    if (raw.startsWith('data:image')) {
      hrefs.push(raw);
      continue;
    }
    try {
      hrefs.push(new URL(raw, base).href);
    } catch {
      // skip
    }
  }

  // 也抓 meta og:image 作为弱兜底
  const og =
    /<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(
      slice,
    ) ||
    /<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["']/i.exec(
      slice,
    );
  if (og?.[1] && !og[1].startsWith('data:')) {
    try {
      hrefs.push(new URL(og[1], base).href);
    } catch {
      // skip
    }
  }

  return [...new Set(hrefs)];
}

async function tryImage(url: string): Promise<Response | null> {
  if (url.startsWith('data:image')) {
    return responseFromDataUri(url);
  }

  const res = await fetchWithTimeout(url, {
    headers: { Accept: 'image/*,*/*' },
  });
  if (!res || !res.ok) return null;

  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim();
  const buf = await res.arrayBuffer();
  if (!looksLikeImageBytes(buf, contentType)) return null;

  // Google 默认占位图约 726 bytes 的 16x16 globe——保留也比没有强；过小无效
  if (buf.byteLength < 32 && !contentType.includes('svg')) return null;

  const ct =
    contentType.startsWith('image/') || contentType.includes('icon')
      ? contentType || 'image/png'
      : 'image/png';

  return imageResponse(buf, ct);
}

async function resolveFavicon(target: URL): Promise<Response | null> {
  const origin = target.origin;
  const host = target.hostname;

  // 1) 首页 HTML：含 data: URI 的真实图标（如 CloudSSH）
  const page = await fetchWithTimeout(origin + '/', {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });
  if (page?.ok) {
    const html = await page.text();
    for (const href of extractIconHrefs(html, page.url || origin)) {
      const img = await tryImage(href);
      if (img) return img;
    }
  }

  // 2) 常见路径
  for (const path of [
    '/favicon.ico',
    '/favicon.png',
    '/favicon.svg',
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
    '/logo.svg',
    '/logo.png',
  ]) {
    const img = await tryImage(origin + path);
    if (img) return img;
  }

  // 3) 第三方
  for (const third of [
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
    `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(host)}`,
    `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(origin)}`,
    `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(origin)}&size=128`,
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
    `https://favicon.pegnav.internal/${CACHE_VERSION}/${target.hostname}`,
    { method: 'GET' },
  );

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const resolved = await resolveFavicon(target);
  if (!resolved) {
    return new Response(null, {
      status: 404,
      headers: {
        'Cache-Control': 'public, max-age=600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  c.executionCtx.waitUntil(cache.put(cacheKey, resolved.clone()));
  return resolved;
});

export default favicon;
