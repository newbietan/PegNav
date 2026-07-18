import { Hono } from 'hono';
import type { Env } from '../env';

const login = new Hono<{ Bindings: Env }>();

login.post('/', async (c) => {
  let body: { password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false }, 400);
  }

  const { password } = body ?? {};
  if (password && c.env.ADMIN_PASSWORD && password === c.env.ADMIN_PASSWORD) {
    return c.json({ ok: true });
  }
  return c.json({ ok: false }, 401);
});

export default login;
