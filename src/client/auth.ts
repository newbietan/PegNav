const TOKEN_KEY = 'admin_token';
const LEGACY_PW_KEY = 'admin_pw';

export function loadStoredToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  // 清理旧版明文密码
  localStorage.removeItem(LEGACY_PW_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LEGACY_PW_KEY);
}

export function updateAdminUI(isAdmin: boolean) {
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const addCatBtn = document.getElementById('addCatBtn');
  const importBtn = document.getElementById('importBtn');
  const exportBtn = document.getElementById('exportBtn');
  if (loginBtn) loginBtn.style.display = isAdmin ? 'none' : 'inline-block';
  if (logoutBtn) logoutBtn.style.display = isAdmin ? 'inline-block' : 'none';
  if (addCatBtn) addCatBtn.style.display = isAdmin ? 'inline-block' : 'none';
  if (importBtn) importBtn.style.display = isAdmin ? 'inline-block' : 'none';
  if (exportBtn) exportBtn.style.display = isAdmin ? 'inline-block' : 'none';
}
