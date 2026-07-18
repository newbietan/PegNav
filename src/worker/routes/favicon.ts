import { Hono } from 'hono';
import type { Env } from '../env';
import {
  fetchIconBytes,
  normalizeTarget,
  resolveFaviconUrl,
} from '../favicon-resolve';

const favicon = new Hono<{ Bindings: Env }>();

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;
const CACHE_VERSION = 'v4';

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

async function resolveFavicon(target: URL): Promise<Response | null> {
  const iconUrl = await resolveFaviconUrl(target);
  if (!iconUrl) return null;
  const bytes = await fetchIconBytes(iconUrl);
  if (!bytes) return null;
  return imageResponse(bytes.body, bytes.contentType);
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
