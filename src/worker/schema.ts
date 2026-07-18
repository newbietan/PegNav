import type { Env } from './env';

/** 进程内缓存，避免每个请求都跑建表检查 */
let ready = false;

/**
 * 确保表结构存在；若分类表为空则写入示例数据。
 * 部署后首次访问 /api 即可初始化，无需手工执行 SQL。
 */
export async function ensureSchema(env: Env): Promise<void> {
  if (ready) return;

  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        favicon_url TEXT,
        favicon_host TEXT,
        favicon_updated_at INTEGER,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      )
    `),
  ]);

  // 兼容已有库：旧表无图标列时补齐
  await migrateLinksFaviconColumns(env);

  const count = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM categories',
  ).first<{ n: number }>();

  if ((count?.n ?? 0) === 0) {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO categories (name, sort_order) VALUES ('开发工具', 1)`,
      ),
      env.DB.prepare(
        `INSERT INTO categories (name, sort_order) VALUES ('设计参考', 2)`,
      ),
      env.DB.prepare(
        `INSERT INTO categories (name, sort_order) VALUES ('日常常用', 3)`,
      ),
      env.DB.prepare(
        `INSERT INTO links (category_id, title, url, sort_order) VALUES (1, 'GitHub', 'github.com', 1)`,
      ),
      env.DB.prepare(
        `INSERT INTO links (category_id, title, url, sort_order) VALUES (1, 'MDN Web Docs', 'developer.mozilla.org', 2)`,
      ),
      env.DB.prepare(
        `INSERT INTO links (category_id, title, url, sort_order) VALUES (1, 'Cloudflare', 'dash.cloudflare.com', 3)`,
      ),
      env.DB.prepare(
        `INSERT INTO links (category_id, title, url, sort_order) VALUES (1, 'Stack Overflow', 'stackoverflow.com', 4)`,
      ),
      env.DB.prepare(
        `INSERT INTO links (category_id, title, url, sort_order) VALUES (2, 'Dribbble', 'dribbble.com', 1)`,
      ),
      env.DB.prepare(
        `INSERT INTO links (category_id, title, url, sort_order) VALUES (2, 'Figma', 'figma.com', 2)`,
      ),
      env.DB.prepare(
        `INSERT INTO links (category_id, title, url, sort_order) VALUES (3, 'Gmail', 'mail.google.com', 1)`,
      ),
      env.DB.prepare(
        `INSERT INTO links (category_id, title, url, sort_order) VALUES (3, 'Notion', 'notion.so', 2)`,
      ),
      env.DB.prepare(
        `INSERT INTO links (category_id, title, url, sort_order) VALUES (3, 'B 站', 'bilibili.com', 3)`,
      ),
    ]);
  }

  ready = true;
}

async function migrateLinksFaviconColumns(env: Env): Promise<void> {
  const info = await env.DB.prepare('PRAGMA table_info(links)').all<{
    name: string;
  }>();
  const cols = new Set((info.results ?? []).map((r) => r.name));

  const alters: D1PreparedStatement[] = [];
  if (!cols.has('favicon_url')) {
    alters.push(
      env.DB.prepare('ALTER TABLE links ADD COLUMN favicon_url TEXT'),
    );
  }
  if (!cols.has('favicon_host')) {
    alters.push(
      env.DB.prepare('ALTER TABLE links ADD COLUMN favicon_host TEXT'),
    );
  }
  if (!cols.has('favicon_updated_at')) {
    alters.push(
      env.DB.prepare(
        'ALTER TABLE links ADD COLUMN favicon_updated_at INTEGER',
      ),
    );
  }
  if (alters.length) {
    await env.DB.batch(alters);
  }
}
