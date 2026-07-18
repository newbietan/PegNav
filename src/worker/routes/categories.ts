import { Hono } from 'hono';
import type { Env } from '../env';
import { authMiddleware } from '../auth';

const categories = new Hono<{ Bindings: Env }>();

categories.post('/', authMiddleware, async (c) => {
  const body = await c.req.json<{ name?: string }>();
  const name = body?.name?.trim();
  if (!name) {
    return c.json({ error: '分类名称不能为空' }, 400);
  }

  const res = await c.env.DB.prepare(
    'INSERT INTO categories (name, sort_order) VALUES (?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM categories))',
  )
    .bind(name)
    .run();

  return c.json({ id: res.meta.last_row_id, name });
});

categories.put('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string }>();
  const name = body?.name?.trim();
  if (!name) {
    return c.json({ error: '分类名称不能为空' }, 400);
  }

  const result = await c.env.DB.prepare(
    'UPDATE categories SET name = ? WHERE id = ?',
  )
    .bind(name.slice(0, 100), id)
    .run();

  if (!result.meta.changes) {
    return c.json({ error: '分类不存在' }, 404);
  }
  return c.json({ ok: true, id: Number(id), name: name.slice(0, 100) });
});

categories.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM links WHERE category_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default categories;
