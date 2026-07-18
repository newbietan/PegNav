/** 解析浏览器导出的 Netscape Bookmark HTML（Chrome / Edge / Firefox） */

export type ParsedLink = {
  title: string;
  url: string;
};

export type ParsedCategory = {
  name: string;
  links: ParsedLink[];
};

export type ParseResult = {
  categories: ParsedCategory[];
  totalLinks: number;
  skipped: number;
};

const SKIP_FOLDER_NAMES = new Set([
  'bookmarks',
  'bookmarks bar',
  'bookmarks toolbar',
  'other bookmarks',
  'mobile bookmarks',
  '收藏夹',
  '收藏夹栏',
  '书签栏',
  '其他收藏夹',
  '移动设备书签',
  '已导入的',
]);

function decodeHtmlEntities(text: string): string {
  const el = document.createElement('textarea');
  el.innerHTML = text;
  return el.value;
}

function stripTags(text: string): string {
  return decodeHtmlEntities(text.replace(/<[^>]+>/g, '')).trim();
}

function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^(javascript|data|chrome|edge|about|place|file):/i.test(t)) return null;
  try {
    const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    const u = new URL(withProto);
    if (!u.hostname) return null;
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.href;
  } catch {
    return null;
  }
}

function isSkipFolder(name: string): boolean {
  return SKIP_FOLDER_NAMES.has(name.trim().toLowerCase());
}

function attr(attrs: string, name: string): string | null {
  const re = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  );
  const m = re.exec(attrs);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

type Ev =
  | { type: 'dl_open' }
  | { type: 'dl_close' }
  | { type: 'h3'; name: string }
  | { type: 'a'; title: string; url: string };

/**
 * Netscape 书签 HTML 不合法，DOMParser 会把兄弟文件夹嵌套错。
 * 这里按源码顺序扫描 H3 / A / DL，用栈维护文件夹路径。
 */
function tokenize(html: string): Ev[] {
  // 去掉超长 base64 图标，加快扫描
  const cleaned = html.replace(/\sICON\s*=\s*"[^"]*"/gi, '');
  const events: Ev[] = [];
  const re =
    /<\/?DL\b[^>]*>|<H3\b([^>]*)>([\s\S]*?)<\/H3\s*>|<A\s+([^>]*?)>([\s\S]*?)<\/A\s*>/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) {
    const token = m[0];
    if (/^<\/DL/i.test(token)) {
      events.push({ type: 'dl_close' });
      continue;
    }
    if (/^<DL/i.test(token)) {
      events.push({ type: 'dl_open' });
      continue;
    }
    if (/^<H3/i.test(token)) {
      const name = stripTags(m[2] || '') || '未命名文件夹';
      events.push({ type: 'h3', name });
      continue;
    }
    if (/^<A\s/i.test(token)) {
      const href = attr(m[3] || '', 'HREF') || attr(m[3] || '', 'href');
      if (!href) continue;
      const url = normalizeUrl(href);
      if (!url) continue;
      const title = stripTags(m[4] || '') || (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return url;
        }
      })();
      events.push({ type: 'a', title, url });
    }
  }
  return events;
}

function buildCategories(events: Ev[]): ParsedCategory[] {
  // 每个打开的文件夹：名称（H3 之后进入其 DL）
  type Frame = { name: string; links: ParsedLink[]; awaitingDl: boolean };
  const stack: Frame[] = [{ name: '', links: [], awaitingDl: false }];
  const finished: { name: string; links: ParsedLink[] }[] = [];

  for (const ev of events) {
    if (ev.type === 'h3') {
      // 新文件夹：压栈，等待其后的 DL
      stack.push({ name: ev.name, links: [], awaitingDl: true });
      continue;
    }
    if (ev.type === 'dl_open') {
      const top = stack[stack.length - 1];
      if (top?.awaitingDl) top.awaitingDl = false;
      continue;
    }
    if (ev.type === 'dl_close') {
      if (stack.length <= 1) continue;
      const folder = stack.pop()!;
      // 只保留有链接的非系统文件夹；链接也可能在关闭前已收集
      const usableName =
        folder.name && !isSkipFolder(folder.name) ? folder.name : '';
      if (usableName && folder.links.length) {
        finished.push({ name: usableName, links: folder.links });
      } else if (!usableName && folder.links.length) {
        // 系统根夹下的直链：并入其父，或记为未分类
        const parent = stack[stack.length - 1];
        if (parent) parent.links.push(...folder.links);
        else finished.push({ name: '未分类', links: folder.links });
      }
      continue;
    }
    if (ev.type === 'a') {
      // 挂到最近的「有效」文件夹；跳过仅 awaiting 的空名
      let target = stack[stack.length - 1];
      // 若栈顶是系统名，仍先放进该帧，关闭时上浮到父或未分类
      target.links.push({ title: ev.title, url: ev.url });
    }
  }

  // 未闭合的帧
  while (stack.length > 1) {
    const folder = stack.pop()!;
    const usableName =
      folder.name && !isSkipFolder(folder.name) ? folder.name : '';
    if (usableName && folder.links.length) {
      finished.push({ name: usableName, links: folder.links });
    } else if (folder.links.length) {
      const parent = stack[stack.length - 1];
      if (parent) parent.links.push(...folder.links);
      else finished.push({ name: '未分类', links: folder.links });
    }
  }
  if (stack[0].links.length) {
    finished.push({ name: '未分类', links: stack[0].links });
  }

  // 同名分类合并 + URL 去重
  const map = new Map<string, ParsedLink[]>();
  for (const f of finished) {
    const list = map.get(f.name) || [];
    const seen = new Set(list.map((l) => l.url));
    for (const link of f.links) {
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      list.push(link);
    }
    map.set(f.name, list);
  }

  return [...map.entries()]
    .filter(([, links]) => links.length > 0)
    .map(([name, links]) => ({ name, links }));
}

export function parseBookmarkHtml(html: string): ParseResult {
  if (!html?.trim()) {
    throw new Error('文件内容为空');
  }
  if (!/<A\s/i.test(html) && !/<a\s/i.test(html)) {
    throw new Error('无法识别书签文件：未找到链接');
  }

  let categories = buildCategories(tokenize(html));

  // 兜底：纯扫 A
  if (categories.length === 0) {
    const links: ParsedLink[] = [];
    const seen = new Set<string>();
    const re = /<A\s+([^>]*?)>([\s\S]*?)<\/A\s*>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html.replace(/\sICON\s*=\s*"[^"]*"/gi, '')))) {
      const href = attr(m[1] || '', 'HREF') || attr(m[1] || '', 'href');
      if (!href) continue;
      const url = normalizeUrl(href);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const title = stripTags(m[2] || '') || new URL(url).hostname;
      links.push({ title, url });
    }
    if (links.length) categories = [{ name: '导入的书签', links }];
  }

  if (!categories.length) {
    throw new Error('文件中没有可导入的链接');
  }

  const totalLinks = categories.reduce((n, c) => n + c.links.length, 0);
  return { categories, totalLinks, skipped: 0 };
}

export function summarizeImport(result: ParseResult): string {
  const lines = result.categories.map(
    (c) => `· ${c.name}（${c.links.length} 个链接）`,
  );
  return `共 ${result.categories.length} 个分类、${result.totalLinks} 个链接\n${lines.join('\n')}`;
}
