// 校验请求头里的管理密码是否正确
// 前端在每次"添加/编辑/删除"请求时，会带上 Authorization: Bearer <密码>
export function checkAuth(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return !!env.ADMIN_PASSWORD && token === env.ADMIN_PASSWORD;
}

export function unauthorized() {
  return new Response(JSON.stringify({ error: '密码错误或未登录' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
