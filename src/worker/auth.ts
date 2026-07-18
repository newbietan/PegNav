import type { Context, Next } from 'hono';
import type { Env } from './env';
import { authorize } from './token';

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const ok = await authorize(c.req.header('Authorization'), c.env.ADMIN_PASSWORD);
  if (!ok) {
    return c.json({ error: '未登录或登录已过期' }, 401);
  }
  await next();
}
