import type { Section } from './types';

export function domainOf(u: string): string {
  try {
    return new URL(u.startsWith('http') ? u : `https://${u}`).hostname;
  } catch {
    return u;
  }
}

/** Google 公共图标服务（优先） */
export function googleFaviconUrl(u: string): string {
  const host = domainOf(u);
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`;
}

/** 本站 Worker 代理（失败兜底，支持 data: URI 等） */
export function workerFaviconUrl(u: string): string {
  const raw = u.trim();
  const full = raw.startsWith('http') ? raw : `https://${raw}`;
  return `/api/favicon?url=${encodeURIComponent(full)}`;
}

/**
 * 依次尝试：Google s2 → Worker 代理 → 首字母。
 * 用独立 Image 探测，避免 display:none / lazy 导致永不加载。
 */
export function bindFavicon(img: HTMLImageElement, fallback: HTMLElement, url: string) {
  const sources = [googleFaviconUrl(url), workerFaviconUrl(url)];
  let index = 0;
  let done = false;

  fallback.style.display = 'flex';
  img.style.display = 'none';
  img.alt = '';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';

  const showLetter = () => {
    if (done) return;
    done = true;
    img.style.display = 'none';
    img.removeAttribute('src');
    fallback.style.display = 'flex';
  };

  const showImage = (src: string) => {
    if (done) return;
    done = true;
    img.src = src;
    img.style.display = '';
    fallback.style.display = 'none';
  };

  const tryNext = () => {
    if (done) return;
    if (index >= sources.length) {
      showLetter();
      return;
    }
    const src = sources[index++];
    const probe = new Image();
    probe.referrerPolicy = 'no-referrer';
    probe.onload = () => {
      if (done) return;
      if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        showImage(src);
      } else {
        tryNext();
      }
    };
    probe.onerror = () => {
      if (done) return;
      tryNext();
    };
    probe.src = src;
  };

  tryNext();
}

export type RenderHandlers = {
  isAdmin: boolean;
  onDeleteCategory: (catId: number) => void;
  onRenameCategory: (catId: number) => void;
  onEditCard: (catId: number, itemId: number, e: MouseEvent) => void;
  onDeleteCard: (itemId: number, e: MouseEvent) => void;
  onOpenAdd: (catId: number) => void;
};

/** 按关键词过滤分类与链接（标题 / URL / 域名 / 分类名） */
export function filterSections(data: Section[], query: string): Section[] {
  const q = query.trim().toLowerCase();
  if (!q) return data;

  const out: Section[] = [];
  for (const section of data) {
    const catHit = section.cat.toLowerCase().includes(q);
    const items = section.items.filter((item) => {
      if (catHit) return true;
      const title = item.t.toLowerCase();
      const url = item.u.toLowerCase();
      const host = domainOf(item.u).toLowerCase();
      return title.includes(q) || url.includes(q) || host.includes(q);
    });
    if (items.length > 0 || catHit) {
      out.push({
        ...section,
        items: catHit ? section.items : items,
      });
    }
  }
  return out;
}

export function renderSections(
  data: Section[],
  handlers: RenderHandlers,
  options?: { emptyMessage?: string },
) {
  const root = document.getElementById('sections');
  if (!root) return;
  root.innerHTML = '';

  if (data.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent =
      options?.emptyMessage ||
      (handlers.isAdmin
        ? '还没有分类，点右上角「新建分类」开始添加。'
        : '还没有内容。');
    root.appendChild(empty);
    return;
  }

  for (const section of data) {
    const sec = document.createElement('div');
    sec.className = 'section';

    const head = document.createElement('div');
    head.className = 'section-head';

    const hook = document.createElement('div');
    hook.className = 'hook';

    const titleEl = document.createElement('div');
    titleEl.className = 'section-title';
    titleEl.textContent = section.cat;

    const line = document.createElement('div');
    line.className = 'section-line';

    const countEl = document.createElement('div');
    countEl.className = 'section-count';
    countEl.textContent = `${section.items.length} 项`;

    head.append(hook, titleEl, line, countEl);

    if (handlers.isAdmin) {
      const actions = document.createElement('div');
      actions.className = 'cat-actions';

      const rename = document.createElement('button');
      rename.className = 'cat-action';
      rename.type = 'button';
      rename.title = '重命名分类';
      rename.textContent = '✎';
      rename.addEventListener('click', () => handlers.onRenameCategory(section.id));

      const del = document.createElement('button');
      del.className = 'del-cat';
      del.type = 'button';
      del.title = '删除分类';
      del.textContent = '✕';
      del.addEventListener('click', () => handlers.onDeleteCategory(section.id));

      actions.append(rename, del);
      head.appendChild(actions);
    }
    sec.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.id = `grid-${section.id}`;

    for (const item of section.items) {
      const card = document.createElement('div');
      card.className = 'tag-card';
      card.addEventListener('click', () => {
        window.open(`https://${domainOf(item.u)}`, '_blank');
      });

      const hole = document.createElement('div');
      hole.className = 'peg-hole';
      card.appendChild(hole);

      if (handlers.isAdmin) {
        const actions = document.createElement('div');
        actions.className = 'actions';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.textContent = '✎';
        editBtn.addEventListener('click', (e) =>
          handlers.onEditCard(section.id, item.id, e),
        );

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'del';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', (e) => handlers.onDeleteCard(item.id, e));

        actions.append(editBtn, delBtn);
        card.appendChild(actions);
      }

      const favWrap = document.createElement('div');
      favWrap.className = 'favicon-wrap';

      const img = document.createElement('img');
      img.alt = '';

      const fallback = document.createElement('div');
      fallback.className = 'favicon-fallback';
      fallback.textContent = item.t.slice(0, 1) || '?';

      bindFavicon(img, fallback, item.u);
      favWrap.append(img, fallback);
      card.appendChild(favWrap);

      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = item.t;
      card.appendChild(title);

      const tip = document.createElement('div');
      tip.className = 'url-tooltip';
      tip.textContent = domainOf(item.u);
      card.appendChild(tip);

      grid.appendChild(card);
    }

    if (handlers.isAdmin) {
      const addBtn = document.createElement('div');
      addBtn.className = 'add-card';

      const plus = document.createElement('div');
      plus.className = 'plus';
      plus.textContent = '+';

      const span = document.createElement('span');
      span.textContent = '添加标签';

      addBtn.append(plus, span);
      addBtn.addEventListener('click', () => handlers.onOpenAdd(section.id));
      grid.appendChild(addBtn);
    }

    sec.appendChild(grid);
    root.appendChild(sec);
  }
}

export function fillCatOptions(data: Section[], selectedId: number) {
  const sel = document.getElementById('fCat') as HTMLSelectElement | null;
  if (!sel) return;
  sel.innerHTML = '';
  for (const s of data) {
    const opt = document.createElement('option');
    opt.value = String(s.id);
    opt.textContent = s.cat;
    sel.appendChild(opt);
  }
  sel.value = String(selectedId);
}
