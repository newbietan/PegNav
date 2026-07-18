import type { Section } from './types';

export function domainOf(u: string): string {
  try {
    return new URL(u.startsWith('http') ? u : `https://${u}`).hostname;
  } catch {
    return u;
  }
}

export function googleFaviconUrl(u: string): string {
  const host = domainOf(u);
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`;
}

export function workerFaviconUrl(u: string): string {
  const raw = u.trim();
  const full = raw.startsWith('http') ? raw : `https://${raw}`;
  return `/api/favicon?url=${encodeURIComponent(full)}`;
}

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
  /** 筛选中时禁用拖拽，避免顺序与数据不一致 */
  canReorder: boolean;
  onDeleteCategory: (catId: number) => void;
  onRenameCategory: (catId: number) => void;
  onEditCard: (catId: number, itemId: number, e: MouseEvent) => void;
  onDeleteCard: (itemId: number, e: MouseEvent) => void;
  onOpenAdd: (catId: number) => void;
  onReorderCategories: (orderedIds: number[]) => void;
  onReorderLinks: (categoryId: number, orderedIds: number[]) => void;
};

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

export function renderLoading() {
  const root = document.getElementById('sections');
  if (!root) return;
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'loading-state';
  wrap.setAttribute('aria-busy', 'true');
  wrap.innerHTML = `
    <div class="skeleton-block"></div>
    <div class="skeleton-grid">
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    </div>
    <p class="loading-text">加载导航数据…</p>
  `;
  root.appendChild(wrap);
}

export function renderErrorState(message: string, onRetry: () => void) {
  const root = document.getElementById('sections');
  if (!root) return;
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'empty-state error-state';
  const p = document.createElement('p');
  p.textContent = message;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn primary';
  btn.textContent = '重试';
  btn.addEventListener('click', onRetry);
  box.append(p, btn);
  root.appendChild(box);
}

function bindSectionDrag(
  root: HTMLElement,
  handlers: RenderHandlers,
) {
  if (!handlers.isAdmin || !handlers.canReorder) return;

  let dragEl: HTMLElement | null = null;

  root.querySelectorAll<HTMLElement>('.section[data-cat-id]').forEach((sec) => {
    const handle = sec.querySelector('.drag-handle-cat') as HTMLElement | null;
    if (!handle) return;
    handle.draggable = true;
    handle.addEventListener('dragstart', (e) => {
      dragEl = sec;
      sec.classList.add('dragging');
      e.dataTransfer?.setData('text/plain', sec.dataset.catId || '');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    handle.addEventListener('dragend', () => {
      sec.classList.remove('dragging');
      dragEl = null;
      root.querySelectorAll('.section.drag-over').forEach((el) => el.classList.remove('drag-over'));
      const ids = [...root.querySelectorAll<HTMLElement>('.section[data-cat-id]')].map((el) =>
        Number(el.dataset.catId),
      );
      handlers.onReorderCategories(ids);
    });
    sec.addEventListener('dragover', (e) => {
      if (!dragEl || dragEl === sec) return;
      e.preventDefault();
      sec.classList.add('drag-over');
      const rect = sec.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      if (before) root.insertBefore(dragEl, sec);
      else root.insertBefore(dragEl, sec.nextSibling);
    });
    sec.addEventListener('dragleave', () => sec.classList.remove('drag-over'));
  });
}

function bindCardDrag(grid: HTMLElement, categoryId: number, handlers: RenderHandlers) {
  if (!handlers.isAdmin || !handlers.canReorder) return;

  let dragEl: HTMLElement | null = null;

  grid.querySelectorAll<HTMLElement>('.tag-card[data-item-id]').forEach((card) => {
    card.draggable = true;
    card.addEventListener('dragstart', (e) => {
      dragEl = card;
      card.classList.add('dragging');
      e.dataTransfer?.setData('text/plain', card.dataset.itemId || '');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      e.stopPropagation();
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      dragEl = null;
      grid.querySelectorAll('.tag-card.drag-over').forEach((el) => el.classList.remove('drag-over'));
      const ids = [...grid.querySelectorAll<HTMLElement>('.tag-card[data-item-id]')].map((el) =>
        Number(el.dataset.itemId),
      );
      handlers.onReorderLinks(categoryId, ids);
    });
    card.addEventListener('dragover', (e) => {
      if (!dragEl || dragEl === card) return;
      e.preventDefault();
      e.stopPropagation();
      card.classList.add('drag-over');
      const rect = card.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      if (before) grid.insertBefore(dragEl, card);
      else grid.insertBefore(dragEl, card.nextSibling);
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
  });
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
    sec.dataset.catId = String(section.id);

    const head = document.createElement('div');
    head.className = 'section-head';

    if (handlers.isAdmin && handlers.canReorder) {
      const drag = document.createElement('button');
      drag.type = 'button';
      drag.className = 'drag-handle-cat';
      drag.title = '拖动调整分类顺序';
      drag.textContent = '⋮⋮';
      head.appendChild(drag);
    }

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
      card.dataset.itemId = String(item.id);
      card.addEventListener('click', () => {
        if (card.classList.contains('dragging')) return;
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

    bindCardDrag(grid, section.id, handlers);
    sec.appendChild(grid);
    root.appendChild(sec);
  }

  bindSectionDrag(root, handlers);
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
