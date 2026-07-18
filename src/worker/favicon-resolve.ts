const FETCH_TIMEOUT_MS = 8000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export function normalizeTarget(raw: string | undefined): URL | null {
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

export function hostnameOf(raw: string): string | null {
  const url = normalizeTarget(raw);
  return url?.hostname ?? null;
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

function looksLikeImageBytes(buf: ArrayBuffer, contentType: string): boolean {
  if (!buf.byteLength || buf.byteLength < 8) return false;
  const head = new Uint8Array(buf.slice(0, 16));
  const asText = new TextDecoder().decode(head).toLowerCase();
  if (asText.includes('<!doctype') || asText.includes('<html')) return false;

  if (head[0] === 0x89 && head[1] === 0x50) return true; // PNG
  if (head[0] === 0xff && head[1] === 0xd8) return true; // JPEG
  if (head[0] === 0x47 && head[1] === 0x49) return true; // GIF
  if (head[0] === 0x52 && head[1] === 0x49) return true; // RIFF/webp
  if (head[0] === 0x00 && head[1] === 0x00 && head[2] === 0x01) return true; // ICO
  if (asText.includes('<svg') || asText.includes('<?xml')) return true;

  const ct = contentType.toLowerCase();
  return ct.startsWith('image/') || ct.includes('icon');
}

function isValidDataUri(dataUri: string): boolean {
  const m =
    /^data:(image\/[a-z0-9.+-]+|image\/svg\+xml)(;charset=[^;]+)?(;base64)?,(.*)$/i.exec(
      dataUri.trim(),
    );
  if (!m) return false;
  const isBase64 = Boolean(m[3]);
  const data = m[4];
  try {
    if (isBase64) {
      const binary = atob(data.replace(/\s/g, ''));
      return binary.length >= 8;
    }
    return decodeURIComponent(data).length >= 8;
  } catch {
    return false;
  }
}

function extractIconHrefs(html: string, base: string): string[] {
  const slice = html.slice(0, 200_000);
  const hrefs: string[] = [];

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

/** 校验候选地址是否为可用图标，成功则返回该地址（data URI 原样返回） */
export async function probeIconUrl(url: string): Promise<string | null> {
  if (url.startsWith('data:image')) {
    return isValidDataUri(url) ? url : null;
  }

  const res = await fetchWithTimeout(url, {
    headers: { Accept: 'image/*,*/*' },
  });
  if (!res || !res.ok) return null;

  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim();
  const buf = await res.arrayBuffer();
  if (!looksLikeImageBytes(buf, contentType)) return null;
  if (buf.byteLength < 32 && !contentType.includes('svg')) return null;

  return url;
}

/**
 * 解析站点可用的 favicon 源地址（优先站点自身，再第三方）。
 * 返回可直接用于 <img src> 的 URL 或 data URI。
 */
export async function resolveFaviconUrl(target: URL): Promise<string | null> {
  const origin = target.origin;
  const host = target.hostname;

  const page = await fetchWithTimeout(origin + '/', {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });
  if (page?.ok) {
    const html = await page.text();
    for (const href of extractIconHrefs(html, page.url || origin)) {
      const ok = await probeIconUrl(href);
      if (ok) return ok;
    }
  }

  for (const path of [
    '/favicon.ico',
    '/favicon.png',
    '/favicon.svg',
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
    '/logo.svg',
    '/logo.png',
  ]) {
    const ok = await probeIconUrl(origin + path);
    if (ok) return ok;
  }

  for (const third of [
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
    `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(host)}`,
    `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(origin)}`,
    `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(origin)}&size=128`,
  ]) {
    const ok = await probeIconUrl(third);
    if (ok) return ok;
  }

  return null;
}

export async function fetchIconBytes(
  url: string,
): Promise<{ body: ArrayBuffer | string; contentType: string } | null> {
  if (url.startsWith('data:image')) {
    const m =
      /^data:(image\/[a-z0-9.+-]+|image\/svg\+xml)(;charset=[^;]+)?(;base64)?,(.*)$/i.exec(
        url.trim(),
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
        return { body: bytes.buffer, contentType: mime };
      }
      const decoded = decodeURIComponent(data);
      if (decoded.length < 8) return null;
      return {
        body: decoded,
        contentType: mime.includes('svg') ? 'image/svg+xml' : mime,
      };
    } catch {
      return null;
    }
  }

  const res = await fetchWithTimeout(url, {
    headers: { Accept: 'image/*,*/*' },
  });
  if (!res || !res.ok) return null;
  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim();
  const buf = await res.arrayBuffer();
  if (!looksLikeImageBytes(buf, contentType)) return null;
  if (buf.byteLength < 32 && !contentType.includes('svg')) return null;
  const ct =
    contentType.startsWith('image/') || contentType.includes('icon')
      ? contentType || 'image/png'
      : 'image/png';
  return { body: buf, contentType: ct };
}
