import { Hono } from 'hono';
import type { Env } from '../env';
import { authMiddleware } from '../auth';
import { normalizeUrl as normalizeUrlShared } from '../../shared/url';
import { scheduleFaviconRefresh } from '../favicon-store';

const importRoute = new Hono<{ Bindings: Env }>();

type ImportLink = { title?: string; url?: string };
type ImportCategory = { name?: string; links?: ImportLink[] };

type ImportBody = {
  mode?: 'merge' | 'replace';
  categories?: ImportCategory[];
};

const MAX_CATEGORIES = 200;
const MAX_LINKS = 5000;

function normalizeUrl(raw: string): string | null {
  const r = normalizeUrlShared(raw);
  return r.ok ? r.url : null;
}

importRoute.post('/', authMiddleware, async (c) => {
  let body: ImportBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求体不是合法 JSON' }, 400);
  }

  const mode = body.mode === 'replace' ? 'replace' : 'merge';
  const incoming = body.categories;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return c.json({ error: '没有可导入的分类' }, 400);
  }
  if (incoming.length > MAX_CATEGORIES) {
    return c.json({ error: `分类过多（最多 ${MAX_CATEGORIES}）` }, 400);
  }

  // 规范化
  const prepared: { name: string; links: { title: string; url: string }[] }[] =
    [];
  let linkCount = 0;
  for (const cat of incoming) {
    const name = (cat.name || '').trim();
    if (!name) continue;
    const links: { title: string; url: string }[] = [];
    const seen = new Set<string>();
    for (const item of cat.links || []) {
      const url = normalizeUrl(item.url || '');
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const title = (item.title || '').trim() || (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return url;
        }
      })();
      links.push({ title: title.slice(0, 200), url: url.slice(0, 2000) });
      linkCount++;
      if (linkCount > MAX_LINKS) {
        return c.json({ error: `链接过多（最多 ${MAX_LINKS}）` }, 400);
      }
    }
    if (links.length) prepared.push({ name: name.slice(0, 100), links });
  }

  if (!prepared.length) {
    return c.json({ error: '解析后没有有效链接' }, 400);
  }

  if (mode === 'replace') {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM links'),
      c.env.DB.prepare('DELETE FROM categories'),
    ]);
  }

  // 现有分类 name -> id
  const existingCats = await c.env.DB.prepare(
    'SELECT id, name FROM categories',
  ).all<{ id: number; name: string }>();
  const catIdByName = new Map<string, number>();
  for (const row of existingCats.results ?? []) {
    catIdByName.set(row.name, row.id);
  }

  // 现有链接 url（全局去重，避免重复卡片）
  const existingLinks = await c.env.DB.prepare(
    'SELECT url FROM links',
  ).all<{ url: string }>();
  const existingUrls = new Set(
    (existingLinks.results ?? []).map((r) => r.url),
  );

  let categoriesCreated = 0;
  let linksCreated = 0;
  let linksSkipped = 0;
  const pendingFavicon: { url: string }[] = [];

  // 当前最大 sort_order
  const maxCatOrder =
    (
      await c.env.DB.prepare(
        'SELECT COALESCE(MAX(sort_order), 0) AS n FROM categories',
      ).first<{ n: number }>()
    )?.n ?? 0;
  let nextCatOrder = maxCatOrder + 1;

  for (const cat of prepared) {
    let catId = catIdByName.get(cat.name);
    if (catId == null) {
      const res = await c.env.DB.prepare(
        'INSERT INTO categories (name, sort_order) VALUES (?, ?)',
      )
        .bind(cat.name, nextCatOrder++)
        .run();
      catId = Number(res.meta.last_row_id);
      catIdByName.set(cat.name, catId);
      categoriesCreated++;
    }

    const maxLinkOrder =
      (
        await c.env.DB.prepare(
          'SELECT COALESCE(MAX(sort_order), 0) AS n FROM links WHERE category_id = ?',
        )
          .bind(catId)
          .first<{ n: number }>()
      )?.n ?? 0;
    let nextLinkOrder = maxLinkOrder + 1;

    const statements: D1PreparedStatement[] = [];
    for (const link of cat.links) {
      if (existingUrls.has(link.url)) {
        linksSkipped++;
        continue;
      }
      existingUrls.add(link.url);
      statements.push(
        c.env.DB.prepare(
          'INSERT INTO links (category_id, title, url, sort_order) VALUES (?, ?, ?, ?)',
        ).bind(catId, link.title, link.url, nextLinkOrder++),
      );
      pendingFavicon.push({ url: link.url });
      linksCreated++;
    }

    // D1 batch 上限约 1000，分片提交
    const CHUNK = 50;
    for (let i = 0; i < statements.length; i += CHUNK) {
      await c.env.DB.batch(statements.slice(i, i + CHUNK));
    }
  }

  // 导入后按 url 查回 id，异步解析图标（限量，其余交给 cron）
  if (pendingFavicon.length) {
    const urls = pendingFavicon.slice(0, 40).map((x) => x.url);
    const placeholders = urls.map(() => '?').join(',');
    try {
      const rows = await c.env.DB.prepare(
        `SELECT id, url FROM links WHERE url IN (${placeholders})`,
      )
        .bind(...urls)
        .all<{ id: number; url: string }>();

      // 同 host 只调度一次
      const seenHost = new Set<string>();
      let scheduled = 0;
      for (const row of rows.results ?? []) {
        if (scheduled >= 30) break;
        let host = '';
        try {
          host = new URL(
            row.url.startsWith('http') ? row.url : `https://${row.url}`,
          ).hostname;
        } catch {
          host = row.url;
        }
        if (seenHost.has(host)) continue;
        seenHost.add(host);
        scheduleFaviconRefresh(c.executionCtx, c.env, row.id, row.url);
        scheduled++;
      }
    } catch (err) {
      console.error('import favicon schedule failed', err);
    }
  }

  return c.json({
    ok: true,
    mode,
    categories_created: categoriesCreated,
    links_created: linksCreated,
    links_skipped: linksSkipped,
  });
});

export default importRoute;
