import type { DataResponse } from './types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; ok?: boolean };
    if (data?.error) return data.error;
  } catch {
    // ignore
  }
  if (res.status === 429) return '请求过于频繁，请稍后再试';
  if (res.status === 401) return '未登录或登录已过期';
  return `请求失败 (${res.status})`;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    throw new ApiError(await parseError(res), res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function getData() {
  return request<DataResponse>('/api/data');
}

export function login(password: string) {
  return request<{ ok: boolean; token: string; expires_at: number }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function verifySession(token: string) {
  return request<{ ok: boolean }>('/api/login/me', { method: 'GET' }, token);
}

export function createCategory(name: string, token: string) {
  return request<{ id: number; name: string }>(
    '/api/categories',
    { method: 'POST', body: JSON.stringify({ name }) },
    token,
  );
}

export function renameCategory(id: number, name: string, token: string) {
  return request<{ ok: boolean; id: number; name: string }>(
    `/api/categories/${id}`,
    { method: 'PUT', body: JSON.stringify({ name }) },
    token,
  );
}

export function deleteCategory(id: number, token: string) {
  return request<{ ok: boolean }>(
    `/api/categories/${id}`,
    { method: 'DELETE' },
    token,
  );
}

export function createLink(
  payload: { category_id: number; title: string; url: string },
  token: string,
) {
  return request(
    '/api/links',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
}

export function updateLink(
  id: number,
  payload: { category_id: number; title: string; url: string },
  token: string,
) {
  return request(
    `/api/links/${id}`,
    { method: 'PUT', body: JSON.stringify(payload) },
    token,
  );
}

export function deleteLink(id: number, token: string) {
  return request<{ ok: boolean }>(
    `/api/links/${id}`,
    { method: 'DELETE' },
    token,
  );
}

export type ImportPayload = {
  mode: 'merge' | 'replace';
  categories: { name: string; links: { title: string; url: string }[] }[];
};

export type ImportResult = {
  ok: boolean;
  mode: 'merge' | 'replace';
  categories_created: number;
  links_created: number;
  links_skipped: number;
};

export function importBookmarks(payload: ImportPayload, token: string) {
  return request<ImportResult>(
    '/api/import',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
}

export type ReorderPayload = {
  categories?: number[];
  links?: { category_id: number; ids: number[] }[];
};

export function reorder(payload: ReorderPayload, token: string) {
  return request<{ ok: boolean }>(
    '/api/reorder',
    { method: 'PUT', body: JSON.stringify(payload) },
    token,
  );
}
