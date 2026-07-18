// POST /api/login  body: { password }
// 用于前端校验密码是否正确，正确则前端本地记住该密码，之后每次操作都带上
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ ok: false }), { status: 400 });
  }
  const { password } = body || {};
  if (password && env.ADMIN_PASSWORD && password === env.ADMIN_PASSWORD) {
    return Response.json({ ok: true });
  }
  return new Response(JSON.stringify({ ok: false }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
