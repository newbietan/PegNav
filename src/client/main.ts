import './styles.css';
import type { Section } from './types';
import * as api from './api';
import {
  clearToken,
  loadStoredToken,
  saveToken,
  updateAdminUI,
} from './auth';
import { doExternalSearch, getEngine, setEngine, type Engine } from './search';
import {
  fillCatOptions,
  filterSections,
  renderErrorState,
  renderLoading,
  renderSections,
} from './render';
import {
  parseBookmarkHtml,
  summarizeImport,
  type ParseResult,
} from './bookmark-import';
import { confirmDialog, promptDialog, toast } from './ui';
import { exportAsHtml, exportAsJson } from './export';
import { normalizeUrl } from '../shared/url';

let data: Section[] = [];
let editing: { itemId: number } | null = null;
let isAdmin = false;
let adminToken = loadStoredToken();
let pendingImport: ParseResult | null = null;
let filterQuery = '';
let loading = false;

function notifyError(err: unknown) {
  const msg = err instanceof Error ? err.message : '操作失败';
  toast(msg, 'error');
  console.error(err);
  if (err instanceof api.ApiError && err.status === 401) {
    adminToken = '';
    clearToken();
    isAdmin = false;
    paint();
  }
}

function mapData(res: Awaited<ReturnType<typeof api.getData>>): Section[] {
  return res.categories.map((c) => ({
    id: c.id,
    cat: c.name,
    items: c.items.map((i) => ({ id: i.id, t: i.title, u: i.url })),
  }));
}

async function loadData(opts?: { silent?: boolean }) {
  if (!opts?.silent) {
    loading = true;
    renderLoading();
  }
  try {
    const res = await api.getData();
    data = mapData(res);
    loading = false;
    paint();
  } catch (err) {
    loading = false;
    if (!opts?.silent) {
      renderErrorState(
        err instanceof Error ? err.message : '数据加载失败',
        () => {
          void loadData();
        },
      );
    }
    throw err;
  }
}

function visibleData(): Section[] {
  if (getEngine() !== 'local') return data;
  return filterSections(data, filterQuery);
}

function canReorder(): boolean {
  return isAdmin && !(getEngine() === 'local' && filterQuery.trim());
}

function updateFilterHint() {
  const hint = document.getElementById('filterHint');
  if (!hint) return;
  if (getEngine() !== 'local' || !filterQuery.trim()) {
    hint.hidden = true;
    hint.textContent = '';
    return;
  }
  const filtered = filterSections(data, filterQuery);
  const n = filtered.reduce((s, c) => s + c.items.length, 0);
  hint.hidden = false;
  hint.textContent = `站内筛选「${filterQuery.trim()}」：${filtered.length} 个分类 / ${n} 个链接（筛选中不可拖拽排序）`;
}

function paint() {
  if (loading) return;
  updateAdminUI(isAdmin);
  updateFilterHint();
  const view = visibleData();
  const emptyMessage =
    data.length === 0
      ? isAdmin
        ? '还没有分类，点右上角「新建分类」开始添加。'
        : '还没有内容。'
      : getEngine() === 'local' && filterQuery.trim()
        ? '没有匹配的卡片，试试其它关键词。'
        : undefined;
  renderSections(
    view,
    {
      isAdmin,
      canReorder: canReorder(),
      onDeleteCategory: (catId) => {
        void deleteCategory(catId);
      },
      onRenameCategory: (catId) => {
        void renameCategory(catId);
      },
      onEditCard: (catId, itemId, e) => editCard(catId, itemId, e),
      onDeleteCard: (itemId, e) => {
        void deleteCard(itemId, e);
      },
      onOpenAdd: (catId) => openModal(catId),
      onReorderCategories: (ids) => {
        void persistCategoryOrder(ids);
      },
      onReorderLinks: (catId, ids) => {
        void persistLinkOrder(catId, ids);
      },
    },
    { emptyMessage },
  );
}

function applyLocalCategoryOrder(ids: number[]) {
  const map = new Map(data.map((s) => [s.id, s]));
  const next: Section[] = [];
  for (const id of ids) {
    const s = map.get(id);
    if (s) next.push(s);
  }
  for (const s of data) {
    if (!ids.includes(s.id)) next.push(s);
  }
  data = next;
}

function applyLocalLinkOrder(categoryId: number, ids: number[]) {
  data = data.map((s) => {
    if (s.id !== categoryId) return s;
    const map = new Map(s.items.map((i) => [i.id, i]));
    const items = ids.map((id) => map.get(id)).filter(Boolean) as Section['items'];
    for (const i of s.items) {
      if (!ids.includes(i.id)) items.push(i);
    }
    return { ...s, items };
  });
}

async function persistCategoryOrder(ids: number[]) {
  if (!isAdmin || !adminToken) return;
  applyLocalCategoryOrder(ids);
  try {
    await api.reorder({ categories: ids }, adminToken);
  } catch (err) {
    notifyError(err);
    await loadData({ silent: true });
  }
}

async function persistLinkOrder(categoryId: number, ids: number[]) {
  if (!isAdmin || !adminToken) return;
  applyLocalLinkOrder(categoryId, ids);
  try {
    await api.reorder({ links: [{ category_id: categoryId, ids }] }, adminToken);
  } catch (err) {
    notifyError(err);
    await loadData({ silent: true });
  }
}

async function verifyStoredToken() {
  if (!adminToken) return;
  try {
    await api.verifySession(adminToken);
    isAdmin = true;
  } catch {
    adminToken = '';
    clearToken();
    isAdmin = false;
  }
  updateAdminUI(isAdmin);
}

function openLoginModal() {
  const mask = document.getElementById('loginMask');
  const input = document.getElementById('loginPassword') as HTMLInputElement | null;
  const err = document.getElementById('loginError');
  const submit = document.getElementById('loginSubmit') as HTMLButtonElement | null;
  if (err) {
    err.hidden = true;
    err.textContent = '';
  }
  if (input) {
    input.value = '';
    input.classList.remove('invalid');
    input.disabled = false;
  }
  if (submit) {
    submit.disabled = false;
    submit.textContent = '登录';
  }
  mask?.classList.add('show');
  requestAnimationFrame(() => input?.focus());
}

function closeLoginModal() {
  document.getElementById('loginMask')?.classList.remove('show');
}

function setLoginError(message: string) {
  const err = document.getElementById('loginError');
  const input = document.getElementById('loginPassword') as HTMLInputElement | null;
  if (err) {
    err.hidden = false;
    err.textContent = message;
  }
  input?.classList.add('invalid');
  input?.focus();
  input?.select();
}

async function submitLogin(event?: Event) {
  event?.preventDefault();
  const input = document.getElementById('loginPassword') as HTMLInputElement | null;
  const submit = document.getElementById('loginSubmit') as HTMLButtonElement | null;
  const err = document.getElementById('loginError');
  const pw = input?.value ?? '';
  if (!pw.trim()) {
    setLoginError('请输入管理密码');
    return;
  }
  if (err) {
    err.hidden = true;
    err.textContent = '';
  }
  input?.classList.remove('invalid');
  if (submit) {
    submit.disabled = true;
    submit.textContent = '登录中…';
  }
  if (input) input.disabled = true;
  try {
    const res = await api.login(pw);
    adminToken = res.token;
    saveToken(res.token);
    isAdmin = true;
    closeLoginModal();
    paint();
    toast('已进入管理状态', 'success');
  } catch (e) {
    const msg = e instanceof Error ? e.message : '密码错误';
    setLoginError(msg);
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = '登录';
    }
    if (input) input.disabled = false;
  }
}

function doLogout() {
  adminToken = '';
  clearToken();
  isAdmin = false;
  paint();
  toast('已退出管理');
}

async function addCategory() {
  if (!isAdmin) return;
  const name = await promptDialog({
    title: '新建分类',
    message: '输入分类名称，例如「开发工具」。',
    placeholder: '分类名称',
    confirmText: '创建',
  });
  if (!name) return;
  try {
    await api.createCategory(name, adminToken);
    await loadData({ silent: true });
    toast('分类已创建', 'success');
  } catch (err) {
    notifyError(err);
  }
}

async function renameCategory(catId: number) {
  if (!isAdmin) return;
  const section = data.find((s) => s.id === catId);
  if (!section) return;
  const name = await promptDialog({
    title: '重命名分类',
    message: `当前名称：${section.cat}`,
    placeholder: '新分类名称',
    defaultValue: section.cat,
    confirmText: '保存',
  });
  if (!name || name === section.cat) return;
  try {
    await api.renameCategory(catId, name, adminToken);
    await loadData({ silent: true });
    toast('分类已重命名', 'success');
  } catch (err) {
    notifyError(err);
  }
}

async function deleteCategory(catId: number) {
  if (!isAdmin) return;
  const section = data.find((s) => s.id === catId);
  const ok = await confirmDialog({
    title: '删除分类',
    message: section
      ? `确定删除「${section.cat}」？其中的 ${section.items.length} 个标签会一并删除。`
      : '删除该分类会连同其中的标签一起删除，确定吗？',
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deleteCategory(catId, adminToken);
    await loadData({ silent: true });
    toast('分类已删除', 'success');
  } catch (err) {
    notifyError(err);
  }
}

function openModal(catId: number) {
  editing = null;
  const title = document.getElementById('modalTitle');
  const fTitle = document.getElementById('fTitle') as HTMLInputElement;
  const fUrl = document.getElementById('fUrl') as HTMLInputElement;
  if (title) title.textContent = '添加标签';
  fTitle.value = '';
  fUrl.value = '';
  fillCatOptions(data, catId);
  document.getElementById('mask')?.classList.add('show');
}

function editCard(catId: number, itemId: number, e: MouseEvent) {
  e.stopPropagation();
  const section = data.find((s) => s.id === catId);
  const item = section?.items.find((i) => i.id === itemId);
  if (!section || !item) return;
  editing = { itemId };
  const title = document.getElementById('modalTitle');
  const fTitle = document.getElementById('fTitle') as HTMLInputElement;
  const fUrl = document.getElementById('fUrl') as HTMLInputElement;
  if (title) title.textContent = '编辑标签';
  fTitle.value = item.t;
  fUrl.value = item.u;
  fillCatOptions(data, catId);
  document.getElementById('mask')?.classList.add('show');
}

async function deleteCard(itemId: number, e: MouseEvent) {
  e.stopPropagation();
  if (!isAdmin) return;
  const ok = await confirmDialog({
    title: '删除标签',
    message: '确定删除这个标签吗？',
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deleteLink(itemId, adminToken);
    await loadData({ silent: true });
    toast('标签已删除', 'success');
  } catch (err) {
    notifyError(err);
  }
}

function closeModal() {
  document.getElementById('mask')?.classList.remove('show');
}

function setImportError(message: string) {
  const err = document.getElementById('importError');
  if (!err) return;
  if (!message) {
    err.hidden = true;
    err.textContent = '';
    return;
  }
  err.hidden = false;
  err.textContent = message;
}

function resetImportModal() {
  pendingImport = null;
  const file = document.getElementById('importFile') as HTMLInputElement | null;
  const preview = document.getElementById('importPreview');
  const previewText = document.getElementById('importPreviewText');
  const submit = document.getElementById('importSubmit') as HTMLButtonElement | null;
  if (file) file.value = '';
  if (preview) preview.hidden = true;
  if (previewText) previewText.textContent = '';
  if (submit) {
    submit.disabled = true;
    submit.textContent = '开始导入';
  }
  setImportError('');
  const merge = document.querySelector(
    'input[name="importMode"][value="merge"]',
  ) as HTMLInputElement | null;
  if (merge) merge.checked = true;
}

function openImportModal() {
  if (!isAdmin) return;
  resetImportModal();
  document.getElementById('importMask')?.classList.add('show');
}

function closeImportModal() {
  document.getElementById('importMask')?.classList.remove('show');
  resetImportModal();
}

async function onImportFileChange(file: File | undefined) {
  setImportError('');
  pendingImport = null;
  const preview = document.getElementById('importPreview');
  const previewText = document.getElementById('importPreviewText');
  const submit = document.getElementById('importSubmit') as HTMLButtonElement | null;
  if (submit) submit.disabled = true;
  if (preview) preview.hidden = true;
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    setImportError('文件过大（请小于 5MB）');
    return;
  }

  try {
    const text = await file.text();
    const result = parseBookmarkHtml(text);
    if (!result.totalLinks) {
      setImportError('文件中没有可导入的链接');
      return;
    }
    pendingImport = result;
    if (previewText) previewText.textContent = summarizeImport(result);
    if (preview) preview.hidden = false;
    if (submit) submit.disabled = false;
  } catch (err) {
    setImportError(err instanceof Error ? err.message : '解析书签文件失败');
  }
}

async function submitImport() {
  if (!isAdmin || !pendingImport) return;
  const modeInput = document.querySelector(
    'input[name="importMode"]:checked',
  ) as HTMLInputElement | null;
  const mode = modeInput?.value === 'replace' ? 'replace' : 'merge';

  if (mode === 'replace') {
    const ok = await confirmDialog({
      title: '替换导入',
      message: '替换模式会删除当前全部导航数据，再写入导入内容。确定继续吗？',
      confirmText: '清空并导入',
      danger: true,
    });
    if (!ok) return;
  }

  const submit = document.getElementById('importSubmit') as HTMLButtonElement | null;
  if (submit) {
    submit.disabled = true;
    submit.textContent = '导入中…';
  }
  setImportError('');

  try {
    const res = await api.importBookmarks(
      {
        mode,
        categories: pendingImport.categories.map((c) => ({
          name: c.name,
          links: c.links,
        })),
      },
      adminToken,
    );
    closeImportModal();
    await loadData({ silent: true });
    toast(
      `导入完成：+${res.categories_created} 分类 / +${res.links_created} 链接（跳过 ${res.links_skipped}）`,
      'success',
    );
  } catch (err) {
    setImportError(err instanceof Error ? err.message : '导入失败');
    if (submit) {
      submit.disabled = false;
      submit.textContent = '开始导入';
    }
  }
}

async function saveCard() {
  const fTitle = document.getElementById('fTitle') as HTMLInputElement;
  const fUrl = document.getElementById('fUrl') as HTMLInputElement;
  const fCat = document.getElementById('fCat') as HTMLSelectElement;
  const t = fTitle.value.trim();
  const uRaw = fUrl.value.trim();
  const catId = parseInt(fCat.value, 10);
  if (!t || !uRaw || Number.isNaN(catId)) {
    toast('请填写完整名称与网址', 'error');
    return;
  }

  const norm = normalizeUrl(uRaw);
  if (!norm.ok) {
    toast(norm.error, 'error');
    fUrl.focus();
    return;
  }
  // 回写规范化结果，方便用户看到
  fUrl.value = norm.url;

  const payload = { title: t, url: norm.url, category_id: catId };
  try {
    if (editing) {
      await api.updateLink(editing.itemId, payload, adminToken);
      toast('标签已更新', 'success');
    } else {
      await api.createLink(payload, adminToken);
      toast('标签已添加', 'success');
    }
    closeModal();
    await loadData({ silent: true });
  } catch (err) {
    notifyError(err);
  }
}

async function doExport() {
  if (!isAdmin) return;
  if (!data.length) {
    toast('暂无数据可导出', 'error');
    return;
  }
  const choice = await promptDialog({
    title: '导出书签',
    message: '输入格式：html 或 json（默认 html）',
    placeholder: 'html',
    defaultValue: 'html',
    confirmText: '导出',
  });
  if (choice == null) return;
  const fmt = choice.trim().toLowerCase() || 'html';
  if (fmt === 'json') {
    exportAsJson(data);
    toast('已导出 JSON', 'success');
  } else {
    exportAsHtml(data);
    toast('已导出 HTML 书签', 'success');
  }
}

function onSearchInput() {
  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  filterQuery = input?.value ?? '';
  if (getEngine() === 'local') paint();
}

function onSearchGo() {
  if (getEngine() === 'local') {
    onSearchInput();
    const n = visibleData().reduce((s, c) => s + c.items.length, 0);
    if (filterQuery.trim()) {
      toast(n ? `找到 ${n} 个链接` : '没有匹配结果', n ? 'info' : 'error');
    }
    return;
  }
  if (!doExternalSearch()) {
    toast('请输入搜索关键词', 'error');
  }
}

function bindUi() {
  document.getElementById('loginBtn')?.addEventListener('click', openLoginModal);
  document.getElementById('logoutBtn')?.addEventListener('click', doLogout);
  document.getElementById('addCatBtn')?.addEventListener('click', () => {
    void addCategory();
  });
  document.getElementById('importBtn')?.addEventListener('click', openImportModal);
  document.getElementById('exportBtn')?.addEventListener('click', () => {
    void doExport();
  });
  document.getElementById('searchGo')?.addEventListener('click', onSearchGo);
  document.getElementById('searchInput')?.addEventListener('input', onSearchInput);
  document.getElementById('searchInput')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') onSearchGo();
  });
  document.getElementById('modalCancel')?.addEventListener('click', closeModal);
  document.getElementById('modalSave')?.addEventListener('click', () => {
    void saveCard();
  });

  document.getElementById('loginForm')?.addEventListener('submit', (e) => {
    void submitLogin(e);
  });
  document.getElementById('loginCancel')?.addEventListener('click', closeLoginModal);
  document.getElementById('loginMask')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeLoginModal();
  });
  document.getElementById('mask')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.getElementById('importCancel')?.addEventListener('click', closeImportModal);
  document.getElementById('importMask')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeImportModal();
  });
  document.getElementById('importFile')?.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    void onImportFileChange(input.files?.[0]);
  });
  document.getElementById('importSubmit')?.addEventListener('click', () => {
    void submitImport();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/') {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return;
      }
      e.preventDefault();
      setEngine('local');
      document.getElementById('searchInput')?.focus();
      return;
    }
    if (e.key !== 'Escape') return;
    if (document.getElementById('importMask')?.classList.contains('show')) {
      closeImportModal();
      return;
    }
    if (document.getElementById('loginMask')?.classList.contains('show')) {
      closeLoginModal();
      return;
    }
    if (document.getElementById('mask')?.classList.contains('show')) {
      closeModal();
    }
  });

  document.querySelectorAll<HTMLButtonElement>('#engineSwitch button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const engine = btn.dataset.engine as Engine | undefined;
      if (!engine) return;
      setEngine(engine);
      paint();
    });
  });
}

async function init() {
  bindUi();
  setEngine('local');
  try {
    await loadData();
  } catch {
    // loadData 已渲染错误态
  }
  await verifyStoredToken();
  paint();
}

void init();
