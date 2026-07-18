// GET /api/data —— 公开接口，所有人可查看
export async function onRequestGet({ env }) {
  const cats = await env.DB.prepare(
    'SELECT id, name FROM categories ORDER BY sort_order, id'
  ).all();
  const links = await env.DB.prepare(
    'SELECT id, category_id, title, url FROM links ORDER BY sort_order, id'
  ).all();

  const categories = cats.results.map((c) => ({
    id: c.id,
    name: c.name,
    items: links.results
      .filter((l) => l.category_id === c.id)
      .map((l) => ({ id: l.id, title: l.title, url: l.url })),
  }));

  return Response.json({ categories });
}
