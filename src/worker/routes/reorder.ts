import { Hono } from 'hono';
import type { Env } from '../env';
import { authMiddleware } from '../auth';

const reorder = new Hono<{ Bindings: Env }>();

type ReorderBody = {
  categories?: number[];
  links?: { category_id: number; ids: number[] }[];
};

reorder.put('/', authMiddleware, async (c) => {
  let body: ReorderBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求体不是合法 JSON' }, 400);
  }

  const statements: D1PreparedStatement[] = [];

  if (Array.isArray(body.categories) && body.categories.length) {
    body.categories.forEach((id, index) => {
      if (!Number.isFinite(id)) return;
      statements.push(
        c.env.DB.prepare('UPDATE categories SET sort_order = ? WHERE id = ?').bind(
          index + 1,
          id,
        ),
      );
    });
  }

  if (Array.isArray(body.links)) {
    for (const group of body.links) {
      const catId = group.category_id;
      if (!Number.isFinite(catId) || !Array.isArray(group.ids)) continue;
      group.ids.forEach((id, index) => {
        if (!Number.isFinite(id)) return;
        statements.push(
          c.env.DB.prepare(
            'UPDATE links SET sort_order = ?, category_id = ? WHERE id = ?',
          ).bind(index + 1, catId, id),
        );
      });
    }
  }

  if (!statements.length) {
    return c.json({ error: '没有可更新的排序数据' }, 400);
  }

  const CHUNK = 50;
  for (let i = 0; i < statements.length; i += CHUNK) {
    await c.env.DB.batch(statements.slice(i, i + CHUNK));
  }

  return c.json({ ok: true });
});

export default reorder;
