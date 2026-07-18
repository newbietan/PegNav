import { checkAuth, unauthorized } from '../../_lib/auth.js';

// DELETE /api/categories/:id —— 会一并删除该分类下的所有标签
export async function onRequestDelete({ request, env, params }) {
  if (!checkAuth(request, env)) return unauthorized();
  await env.DB.prepare('DELETE FROM links WHERE category_id = ?').bind(params.id).run();
  await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(params.id).run();
  return Response.json({ ok: true });
}
