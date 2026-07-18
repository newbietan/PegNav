import { Hono } from 'hono';
import type { Env } from './env';
import { ensureSchema } from './schema';
import data from './routes/data';
import login from './routes/login';
import categories from './routes/categories';
import links from './routes/links';
import favicon from './routes/favicon';
import importRoute from './routes/import';
import reorder from './routes/reorder';
import { refreshStaleFavicons } from './favicon-store';

const app = new Hono<{ Bindings: Env }>();

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // 允许 Google 字体与 favicon 外链；脚本仅同源
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://www.google.com https://t1.gstatic.com https://icons.duckduckgo.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

app.use('*', async (c, next) => {
  await next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    c.res.headers.set(k, v);
  }
});

// 图标代理不依赖 D1；其它 API 自动建表
app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/favicon')) {
    await next();
    return;
  }
  try {
    await ensureSchema(c.env);
  } catch (err) {
    console.error('ensureSchema failed', err);
    return c.json(
      {
        error:
          '数据库未就绪。请确认 Worker 已绑定 D1（binding 名 DB）。若刚部署，请等待绑定生效后重试。',
      },
      503,
    );
  }
  await next();
});

app.route('/api/favicon', favicon);
app.route('/api/data', data);
app.route('/api/login', login);
app.route('/api/categories', categories);
app.route('/api/links', links);
app.route('/api/import', importRoute);
app.route('/api/reorder', reorder);

app.notFound(async (c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'not found' }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          await ensureSchema(env);
          const result = await refreshStaleFavicons(env);
          console.log(
            `favicon cron: checked=${result.checked} updated=${result.updated}`,
          );
        } catch (err) {
          console.error('favicon cron failed', err);
        }
      })(),
    );
  },
};
