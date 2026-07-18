import { Hono } from 'hono';
import type { Env } from './env';
import data from './routes/data';
import login from './routes/login';
import categories from './routes/categories';
import links from './routes/links';

const app = new Hono<{ Bindings: Env }>();

app.route('/api/data', data);
app.route('/api/login', login);
app.route('/api/categories', categories);
app.route('/api/links', links);

app.notFound(async (c) => {
  // API 未匹配时返回 JSON；静态资源由 Assets 处理
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'not found' }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
