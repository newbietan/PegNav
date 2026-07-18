import type { Section } from './types';

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

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
 * 任一 load 成功即显示该图。
 */
export function bindFavicon(img: HTMLImageElement, fallback: HTMLElement, url: string) {
  const sources = [googleFaviconUrl(url), workerFaviconUrl(url)];
  let index = 0;

  fallback.style.display = 'flex';
  img.style.display = 'none';

  const showLetter = () => {
    img.style.display = 'none';
    img.removeAttribute('src');
    fallback.style.display = 'flex';
  };

  const showImage = () => {
    img.style.display = '';
    fallback.style.display = 'none';
  };

  const tryNext = () => {
    if (index >= sources.length) {
      showLetter();
      return;
    }
    const src = sources[index++];
    img.src = src;
  };

  img.addEventListener('load', () => {
    // 极小透明/损坏图：继续下一源
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      showImage();
      return;
    }
    tryNext();
  });
  img.addEventListener('error', () => {
    tryNext();
  });

  tryNext();
}

export type RenderHandlers = {
  isAdmin: boolean;
  onDeleteCategory: (catId: number) => void;
  onEditCard: (catId: number, itemId: number, e: MouseEvent) => void;
  onDeleteCard: (itemId: number, e: MouseEvent) => void;
  onOpenAdd: (catId: number) => void;
};

export function renderSections(data: Section[], handlers: RenderHandlers) {
  const root = document.getElementById('sections');
  if (!root) return;
  root.innerHTML = '';

  if (data.length === 0) {
    const tip = handlers.isAdmin
      ? '点右上角"新建分类"开始添加。'
      : '主人还没有整理好这里。';
    root.innerHTML = `<div class="empty-state">还没有分类，${tip}</div>`;
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
      const del = document.createElement('button');
      del.className = 'del-cat';
      del.type = 'button';
      del.textContent = '✕';
      del.addEventListener('click', () => handlers.onDeleteCategory(section.id));
      head.appendChild(del);
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
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';

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
