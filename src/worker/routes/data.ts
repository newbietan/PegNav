import { Hono } from 'hono';
import type { Env } from '../env';
import { scheduleFaviconRefresh } from '../favicon-store';

const data = new Hono<{ Bindings: Env }>();

/** 列表请求时顺手补解析缺失图标（限量，不阻塞响应） */
const LAZY_FILL_LIMIT = 12;

data.get('/', async (c) => {
  const cats = await c.env.DB.prepare(
    'SELECT id, name FROM categories ORDER BY sort_order, id',
  ).all<{ id: number; name: string }>();

  const links = await c.env.DB.prepare(
    `SELECT id, category_id, title, url, favicon_url
     FROM links
     ORDER BY sort_order, id`,
  ).all<{
    id: number;
    category_id: number;
    title: string;
    url: string;
    favicon_url: string | null;
  }>();

  const allLinks = links.results ?? [];

  const categories = (cats.results ?? []).map((cat) => ({
    id: cat.id,
    name: cat.name,
    items: allLinks
      .filter((link) => link.category_id === cat.id)
      .map((link) => ({
        id: link.id,
        title: link.title,
        url: link.url,
        favicon_url: link.favicon_url || null,
      })),
  }));

  // 缺失图标：后台补解析，同 host 去重，下次刷新即可用库内 URL
  const missing = allLinks.filter((l) => !l.favicon_url);
  if (missing.length) {
    const seenHost = new Set<string>();
    let n = 0;
    for (const link of missing) {
      if (n >= LAZY_FILL_LIMIT) break;
      let host = '';
      try {
        const raw = link.url.startsWith('http') ? link.url : `https://${link.url}`;
        host = new URL(raw).hostname;
      } catch {
        host = link.url;
      }
      if (seenHost.has(host)) continue;
      seenHost.add(host);
      scheduleFaviconRefresh(c.executionCtx, c.env, link.id, link.url);
      n++;
    }
  }

  return c.json({ categories });
});

export default data;
