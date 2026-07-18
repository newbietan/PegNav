import { Hono } from 'hono';
import type { Env } from '../env';
import { authMiddleware } from '../auth';
import { normalizeUrl } from '../../shared/url';
import { scheduleFaviconRefresh } from '../favicon-store';

const links = new Hono<{ Bindings: Env }>();

links.post('/', authMiddleware, async (c) => {
  const body = await c.req.json<{
    category_id?: number;
    title?: string;
    url?: string;
  }>();

  const categoryId = body?.category_id;
  const title = body?.title?.trim();
  const rawUrl = body?.url?.trim();

  if (!categoryId || !title || !rawUrl) {
    return c.json({ error: '参数不完整' }, 400);
  }

  const norm = normalizeUrl(rawUrl);
  if (!norm.ok) return c.json({ error: norm.error }, 400);
  const url = norm.url.slice(0, 2000);

  const res = await c.env.DB.prepare(
    'INSERT INTO links (category_id, title, url, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM links WHERE category_id = ?))',
  )
    .bind(categoryId, title.slice(0, 200), url, categoryId)
    .run();

  const id = Number(res.meta.last_row_id);
  scheduleFaviconRefresh(c.executionCtx, c.env, id, url);

  return c.json({
    id,
    category_id: categoryId,
    title: title.slice(0, 200),
    url,
    favicon_url: null,
  });
});

links.put('/:id', authMiddleware, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{
    category_id?: number;
    title?: string;
    url?: string;
  }>();

  const categoryId = body?.category_id;
  const title = body?.title?.trim();
  const rawUrl = body?.url?.trim();

  if (!categoryId || !title || !rawUrl) {
    return c.json({ error: '参数不完整' }, 400);
  }

  const norm = normalizeUrl(rawUrl);
  if (!norm.ok) return c.json({ error: norm.error }, 400);
  const url = norm.url.slice(0, 2000);

  const prev = await c.env.DB.prepare(
    'SELECT url FROM links WHERE id = ?',
  )
    .bind(id)
    .first<{ url: string }>();

  await c.env.DB.prepare(
    'UPDATE links SET title = ?, url = ?, category_id = ? WHERE id = ?',
  )
    .bind(title.slice(0, 200), url, categoryId, id)
    .run();

  // URL 变更时强制重解析；否则仅在缺失时补
  const force = !prev || prev.url !== url;
  if (force) {
    await c.env.DB.prepare(
      `UPDATE links
       SET favicon_url = NULL, favicon_host = NULL, favicon_updated_at = NULL
       WHERE id = ?`,
    )
      .bind(id)
      .run();
  }
  scheduleFaviconRefresh(c.executionCtx, c.env, id, url, force);

  return c.json({ ok: true });
});

links.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM links WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default links;
