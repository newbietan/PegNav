import { Hono } from 'hono';
import type { Env } from '../env';

const data = new Hono<{ Bindings: Env }>();

data.get('/', async (c) => {
  const cats = await c.env.DB.prepare(
    'SELECT id, name FROM categories ORDER BY sort_order, id',
  ).all<{ id: number; name: string }>();

  const links = await c.env.DB.prepare(
    'SELECT id, category_id, title, url FROM links ORDER BY sort_order, id',
  ).all<{ id: number; category_id: number; title: string; url: string }>();

  const categories = (cats.results ?? []).map((cat) => ({
    id: cat.id,
    name: cat.name,
    items: (links.results ?? [])
      .filter((link) => link.category_id === cat.id)
      .map((link) => ({ id: link.id, title: link.title, url: link.url })),
  }));

  return c.json({ categories });
});

export default data;
