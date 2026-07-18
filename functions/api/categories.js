import { checkAuth, unauthorized } from '../_lib/auth.js';

// POST /api/categories  body: { name }
export async function onRequestPost({ request, env }) {
  if (!checkAuth(request, env)) return unauthorized();
  const { name } = await request.json();
  if (!name || !name.trim()) {
    return new Response(JSON.stringify({ error: '分类名称不能为空' }), { status: 400 });
  }
  const res = await env.DB.prepare(
    'INSERT INTO categories (name, sort_order) VALUES (?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM categories))'
  ).bind(name.trim()).run();
  return Response.json({ id: res.meta.last_row_id, name: name.trim() });
}
