import { checkAuth, unauthorized } from '../../_lib/auth.js';

// PUT /api/links/:id  body: { title, url, category_id }
export async function onRequestPut({ request, env, params }) {
  if (!checkAuth(request, env)) return unauthorized();
  const { title, url, category_id } = await request.json();
  if (!title?.trim() || !url?.trim() || !category_id) {
    return new Response(JSON.stringify({ error: '参数不完整' }), { status: 400 });
  }
  await env.DB.prepare(
    'UPDATE links SET title = ?, url = ?, category_id = ? WHERE id = ?'
  ).bind(title.trim(), url.trim(), category_id, params.id).run();
  return Response.json({ ok: true });
}

// DELETE /api/links/:id
export async function onRequestDelete({ request, env, params }) {
  if (!checkAuth(request, env)) return unauthorized();
  await env.DB.prepare('DELETE FROM links WHERE id = ?').bind(params.id).run();
  return Response.json({ ok: true });
}
