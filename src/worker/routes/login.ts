import { Hono } from 'hono';
import type { Env } from '../env';
import {
  clearLoginFailures,
  clientKey,
  isRateLimited,
  recordLoginFailure,
} from '../rate-limit';

const login = new Hono<{ Bindings: Env }>();

login.post('/', async (c) => {
  const key = clientKey(c);

  if (isRateLimited(key)) {
    return c.json(
      { ok: false, error: '尝试次数过多，请 15 分钟后再试' },
      429,
    );
  }

  let body: { password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: '请求格式错误' }, 400);
  }

  const { password } = body ?? {};
  if (password && c.env.ADMIN_PASSWORD && password === c.env.ADMIN_PASSWORD) {
    clearLoginFailures(key);
    return c.json({ ok: true });
  }

  const { remaining, retryAfterSec } = recordLoginFailure(key);
  if (remaining <= 0) {
    return c.json(
      { ok: false, error: `尝试次数过多，请 ${Math.ceil(retryAfterSec / 60)} 分钟后再试` },
      429,
    );
  }
  return c.json(
    { ok: false, error: `密码错误，还可尝试 ${remaining} 次` },
    401,
  );
});

export default login;
