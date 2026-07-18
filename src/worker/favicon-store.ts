import type { Env } from './env';
import { hostnameOf, normalizeTarget, resolveFaviconUrl } from './favicon-resolve';

const STALE_MS = 24 * 60 * 60 * 1000;
/** 单次 cron / 批量刷新上限，避免 Worker 超时 */
const BATCH_LIMIT = 40;
/** 批量时的并发 */
const CONCURRENCY = 4;

export type LinkFaviconRow = {
  id: number;
  url: string;
  favicon_url: string | null;
  favicon_host: string | null;
  favicon_updated_at: number | null;
};

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** 写入/更新单条链接的 favicon 元数据 */
export async function updateLinkFavicon(
  db: D1Database,
  linkId: number,
  faviconUrl: string | null,
  host: string | null,
): Promise<void> {
  await db
    .prepare(
      `UPDATE links
       SET favicon_url = ?, favicon_host = ?, favicon_updated_at = ?
       WHERE id = ?`,
    )
    .bind(faviconUrl, host, nowSec(), linkId)
    .run();
}

/**
 * 将同一 host 下其它链接同步为同一图标。
 * 同时匹配 favicon_host 与常见 url 写法（含协议 / 裸域名）。
 */
async function syncHostFavicon(
  db: D1Database,
  host: string,
  faviconUrl: string | null,
  exceptId?: number,
): Promise<void> {
  const ts = nowSec();
  const except = exceptId ?? -1;
  await db
    .prepare(
      `UPDATE links
       SET favicon_url = ?, favicon_host = ?, favicon_updated_at = ?
       WHERE id != ?
         AND (
           favicon_host = ?
           OR url = ?
           OR url = ?
           OR url = ?
           OR url LIKE ?
           OR url LIKE ?
           OR url LIKE ?
         )`,
    )
    .bind(
      faviconUrl,
      host,
      ts,
      except,
      host,
      host,
      `https://${host}`,
      `http://${host}`,
      `${host}/%`,
      `https://${host}/%`,
      `http://${host}/%`,
    )
    .run();
}

/**
 * 解析并写回单条链接图标。
 * 同 host 已有新鲜记录时复用，减少外网请求。
 */
export async function refreshLinkFavicon(
  env: Env,
  linkId: number,
  linkUrl: string,
  opts?: { force?: boolean },
): Promise<string | null> {
  const host = hostnameOf(linkUrl);
  if (!host) {
    await updateLinkFavicon(env.DB, linkId, null, null);
    return null;
  }

  if (!opts?.force) {
    const shared = await env.DB.prepare(
      `SELECT favicon_url, favicon_updated_at FROM links
       WHERE favicon_host = ? AND favicon_url IS NOT NULL AND favicon_url != ''
       ORDER BY favicon_updated_at DESC
       LIMIT 1`,
    )
      .bind(host)
      .first<{ favicon_url: string; favicon_updated_at: number | null }>();

    if (shared?.favicon_url) {
      const age = shared.favicon_updated_at
        ? Date.now() - shared.favicon_updated_at * 1000
        : STALE_MS + 1;
      if (age < STALE_MS) {
        await updateLinkFavicon(env.DB, linkId, shared.favicon_url, host);
        return shared.favicon_url;
      }
    }
  }

  const target = normalizeTarget(linkUrl);
  if (!target) {
    await updateLinkFavicon(env.DB, linkId, null, host);
    return null;
  }

  // 读取旧值：解析失败时保留，避免短暂外网故障清空已有图标
  const prev = await env.DB.prepare(
    'SELECT favicon_url FROM links WHERE id = ?',
  )
    .bind(linkId)
    .first<{ favicon_url: string | null }>();
  const prevIcon = prev?.favicon_url || null;

  try {
    const icon = await resolveFaviconUrl(target);
    if (icon) {
      await updateLinkFavicon(env.DB, linkId, icon, host);
      await syncHostFavicon(env.DB, host, icon, linkId);
      return icon;
    }
    // 解析不到：仅刷新时间戳，保留旧图标
    await updateLinkFavicon(env.DB, linkId, prevIcon, host);
    return prevIcon;
  } catch (err) {
    console.error('refreshLinkFavicon failed', linkId, err);
    await updateLinkFavicon(env.DB, linkId, prevIcon, host);
    return prevIcon;
  }
}

type WaitUntilCtx = {
  waitUntil(promise: Promise<unknown>): void;
};

/** 后台异步刷新（配合 waitUntil，不阻塞响应） */
export function scheduleFaviconRefresh(
  ctx: WaitUntilCtx,
  env: Env,
  linkId: number,
  linkUrl: string,
  force = false,
): void {
  ctx.waitUntil(
    refreshLinkFavicon(env, linkId, linkUrl, { force }).catch((err) => {
      console.error('scheduleFaviconRefresh', err);
    }),
  );
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  const n = Math.min(concurrency, items.length || 1);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * 刷新过期/缺失图标的链接（cron 入口）。
 * 优先处理从未解析或超过 24h 的记录。
 */
export async function refreshStaleFavicons(env: Env): Promise<{
  checked: number;
  updated: number;
}> {
  const cutoff = nowSec() - Math.floor(STALE_MS / 1000);
  const rows = await env.DB.prepare(
    `SELECT id, url, favicon_url, favicon_host, favicon_updated_at
     FROM links
     WHERE favicon_updated_at IS NULL OR favicon_updated_at < ?
     ORDER BY CASE WHEN favicon_updated_at IS NULL THEN 0 ELSE 1 END,
              favicon_updated_at ASC,
              id ASC
     LIMIT ?`,
  )
    .bind(cutoff, BATCH_LIMIT)
    .all<LinkFaviconRow>();

  const list = rows.results ?? [];
  let updated = 0;

  // 按 host 去重：同 host 只解析一次
  const byHost = new Map<string, LinkFaviconRow[]>();
  const noHost: LinkFaviconRow[] = [];
  for (const row of list) {
    const host = hostnameOf(row.url);
    if (!host) {
      noHost.push(row);
      continue;
    }
    const arr = byHost.get(host) ?? [];
    arr.push(row);
    byHost.set(host, arr);
  }

  for (const row of noHost) {
    await updateLinkFavicon(env.DB, row.id, null, null);
  }

  const hosts = [...byHost.entries()];
  await mapPool(hosts, CONCURRENCY, async ([host, group]) => {
    const primary = group[0];
    const icon = await refreshLinkFavicon(env, primary.id, primary.url, {
      force: true,
    });
    if (icon) updated++;
    for (const row of group.slice(1)) {
      await updateLinkFavicon(env.DB, row.id, icon, host);
    }
  });

  return { checked: list.length, updated };
}
