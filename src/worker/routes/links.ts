import { Hono } from 'hono';
import type { Env } from '../env';
import { authMiddleware } from '../auth';

const links = new Hono<{ Bindings: Env }>();

links.post('/', authMiddleware, async (c) => {
  const body = await c.req.json<{
    category_id?: number;
    title?: string;
    url?: string;
  }>();

  const categoryId = body?.category_id;
  const title = body?.title?.trim();
  const url = body?.url?.trim();

  if (!categoryId || !title || !url) {
    return c.json({ error: '参数不完整' }, 400);
  }

  const res = await c.env.DB.prepare(
    'INSERT INTO links (category_id, title, url, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM links WHERE category_id = ?))',
  )
    .bind(categoryId, title, url, categoryId)
    .run();

  return c.json({
    id: res.meta.last_row_id,
    category_id: categoryId,
    title,
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
  const url = body?.url?.trim();

  if (!categoryId || !title || !url) {
    return c.json({ error: '参数不完整' }, 400);
  }

  await c.env.DB.prepare(
    'UPDATE links SET title = ?, url = ?, category_id = ? WHERE id = ?',
  )
    .bind(title, url, categoryId, id)
    .run();

  return c.json({ ok: true });
});

links.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM links WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default links;
