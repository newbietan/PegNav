import type { Context, Next } from 'hono';
import type { Env } from './env';

export function checkAuth(authHeader: string | undefined, env: Env): boolean {
  if (!authHeader || !env.ADMIN_PASSWORD) return false;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return token === env.ADMIN_PASSWORD;
}

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  if (!checkAuth(c.req.header('Authorization'), c.env)) {
    return c.json({ error: '密码错误或未登录' }, 401);
  }
  await next();
}
