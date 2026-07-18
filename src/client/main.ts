import './styles.css';
import type { Section } from './types';
import * as api from './api';
import {
  clearPassword,
  loadStoredPassword,
  savePassword,
  updateAdminUI,
} from './auth';
import { doSearch, setEngine, type Engine } from './search';
import { fillCatOptions, renderSections } from './render';

let data: Section[] = [];
let editing: { itemId: number } | null = null;
let isAdmin = false;
let adminPw = loadStoredPassword();

function notifyError(err: unknown) {
  const msg = err instanceof Error ? err.message : '操作失败';
  alert(msg);
  console.error(err);
}

function mapData(res: Awaited<ReturnType<typeof api.getData>>): Section[] {
  return res.categories.map((c) => ({
    id: c.id,
    cat: c.name,
    items: c.items.map((i) => ({ id: i.id, t: i.title, u: i.url })),
  }));
}

async function loadData() {
  const res = await api.getData();
  data = mapData(res);
  paint();
}

function paint() {
  updateAdminUI(isAdmin);
  renderSections(data, {
    isAdmin,
    onDeleteCategory: (catId) => {
      void deleteCategory(catId);
    },
    onEditCard: (catId, itemId, e) => editCard(catId, itemId, e),
    onDeleteCard: (itemId, e) => {
      void deleteCard(itemId, e);
    },
    onOpenAdd: (catId) => openModal(catId),
  });
}

async function verifyStoredPassword() {
  if (!adminPw) return;
  try {
    await api.login(adminPw);
    isAdmin = true;
  } catch {
    adminPw = '';
    clearPassword();
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
    await api.login(pw);
    adminPw = pw;
    savePassword(pw);
    isAdmin = true;
    closeLoginModal();
    paint();
  } catch {
    setLoginError('密码错误，请重试');
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = '登录';
    }
    if (input) input.disabled = false;
  }
}

function doLogout() {
  adminPw = '';
  clearPassword();
  isAdmin = false;
  paint();
}

async function addCategory() {
  if (!isAdmin) return;
  const name = prompt('新分类名称');
  if (!name?.trim()) return;
  try {
    await api.createCategory(name.trim(), adminPw);
    await loadData();
  } catch (err) {
    notifyError(err);
  }
}

async function deleteCategory(catId: number) {
  if (!isAdmin) return;
  if (!confirm('删除该分类会连同其中的标签一起删除，确定吗？')) return;
  try {
    await api.deleteCategory(catId, adminPw);
    await loadData();
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
  try {
    await api.deleteLink(itemId, adminPw);
    await loadData();
  } catch (err) {
    notifyError(err);
  }
}

function closeModal() {
  document.getElementById('mask')?.classList.remove('show');
}

async function saveCard() {
  const fTitle = document.getElementById('fTitle') as HTMLInputElement;
  const fUrl = document.getElementById('fUrl') as HTMLInputElement;
  const fCat = document.getElementById('fCat') as HTMLSelectElement;
  const t = fTitle.value.trim();
  const u = fUrl.value.trim();
  const catId = parseInt(fCat.value, 10);
  if (!t || !u || Number.isNaN(catId)) return;

  const payload = { title: t, url: u, category_id: catId };
  try {
    if (editing) {
      await api.updateLink(editing.itemId, payload, adminPw);
    } else {
      await api.createLink(payload, adminPw);
    }
    closeModal();
    await loadData();
  } catch (err) {
    notifyError(err);
  }
}

function bindUi() {
  document.getElementById('loginBtn')?.addEventListener('click', openLoginModal);
  document.getElementById('logoutBtn')?.addEventListener('click', doLogout);
  document.getElementById('addCatBtn')?.addEventListener('click', () => {
    void addCategory();
  });
  document.getElementById('searchGo')?.addEventListener('click', doSearch);
  document.getElementById('searchInput')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') doSearch();
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
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
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
      if (engine) setEngine(engine);
    });
  });
}

async function init() {
  bindUi();
  try {
    await loadData();
  } catch (err) {
    notifyError(err);
    const root = document.getElementById('sections');
    if (root) {
      root.innerHTML =
        '<div class="empty-state">数据加载失败，请确认 Worker / D1 已启动。</div>';
    }
  }
  await verifyStoredPassword();
  paint();
}

void init();
