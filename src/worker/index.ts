import { Hono } from 'hono';
import type { Env } from './env';
import { ensureSchema } from './schema';
import data from './routes/data';
import login from './routes/login';
import categories from './routes/categories';
import links from './routes/links';
import favicon from './routes/favicon';

const app = new Hono<{ Bindings: Env }>();

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

app.notFound(async (c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'not found' }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
