import { checkAuth, unauthorized } from '../_lib/auth.js';

// POST /api/links  body: { category_id, title, url }
export async function onRequestPost({ request, env }) {
  if (!checkAuth(request, env)) return unauthorized();
  const { category_id, title, url } = await request.json();
  if (!category_id || !title?.trim() || !url?.trim()) {
    return new Response(JSON.stringify({ error: '参数不完整' }), { status: 400 });
  }
  const res = await env.DB.prepare(
    'INSERT INTO links (category_id, title, url, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM links WHERE category_id = ?))'
  ).bind(category_id, title.trim(), url.trim(), category_id).run();
  return Response.json({ id: res.meta.last_row_id, category_id, title: title.trim(), url: url.trim() });
}
