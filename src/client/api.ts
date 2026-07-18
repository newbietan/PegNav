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
    const data = (await res.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    // ignore
  }
  return `请求失败 (${res.status})`;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  password?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (password) {
    headers.set('Authorization', `Bearer ${password}`);
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
  return request<{ ok: boolean }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function createCategory(name: string, password: string) {
  return request<{ id: number; name: string }>(
    '/api/categories',
    { method: 'POST', body: JSON.stringify({ name }) },
    password,
  );
}

export function deleteCategory(id: number, password: string) {
  return request<{ ok: boolean }>(
    `/api/categories/${id}`,
    { method: 'DELETE' },
    password,
  );
}

export function createLink(
  payload: { category_id: number; title: string; url: string },
  password: string,
) {
  return request(
    '/api/links',
    { method: 'POST', body: JSON.stringify(payload) },
    password,
  );
}

export function updateLink(
  id: number,
  payload: { category_id: number; title: string; url: string },
  password: string,
) {
  return request(
    `/api/links/${id}`,
    { method: 'PUT', body: JSON.stringify(payload) },
    password,
  );
}

export function deleteLink(id: number, password: string) {
  return request<{ ok: boolean }>(
    `/api/links/${id}`,
    { method: 'DELETE' },
    password,
  );
}
