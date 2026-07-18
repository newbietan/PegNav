import { Hono } from 'hono';
import type { Env } from '../env';
import { authMiddleware } from '../auth';
import { normalizeUrl } from '../../shared/url';

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

  return c.json({
    id: res.meta.last_row_id,
    category_id: categoryId,
    title: title.slice(0, 200),
    url,
  });
});

links.put('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
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

  await c.env.DB.prepare(
    'UPDATE links SET title = ?, url = ?, category_id = ? WHERE id = ?',
  )
    .bind(title.slice(0, 200), url, categoryId, id)
    .run();

  return c.json({ ok: true });
});

links.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM links WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default links;
