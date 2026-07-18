const STORAGE_KEY = 'admin_pw';

export type AuthState = {
  isAdmin: boolean;
  password: string;
};

export function loadStoredPassword(): string {
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function savePassword(password: string) {
  localStorage.setItem(STORAGE_KEY, password);
}

export function clearPassword() {
  localStorage.removeItem(STORAGE_KEY);
}

export function updateAdminUI(isAdmin: boolean) {
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const addCatBtn = document.getElementById('addCatBtn');
  const importBtn = document.getElementById('importBtn');
  if (loginBtn) loginBtn.style.display = isAdmin ? 'none' : 'inline-block';
  if (logoutBtn) logoutBtn.style.display = isAdmin ? 'inline-block' : 'none';
  if (addCatBtn) addCatBtn.style.display = isAdmin ? 'inline-block' : 'none';
  if (importBtn) importBtn.style.display = isAdmin ? 'inline-block' : 'none';
}
