/** HMAC 短期 token，密钥使用 ADMIN_PASSWORD */

const TOKEN_TTL_SEC = 7 * 24 * 60 * 60; // 7 天
const encoder = new TextEncoder();

function b64url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export type SessionPayload = {
  v: 1;
  iat: number;
  exp: number;
};

export async function issueToken(
  secret: string,
  ttlSec = TOKEN_TTL_SEC,
): Promise<{ token: string; expires_at: number }> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { v: 1, iat: now, exp: now + ttlSec };
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const sig = b64url(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return { token: `${body}.${sig}`, expires_at: payload.exp };
}

export async function verifyToken(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  try {
    const key = await importKey(secret);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(sig),
      encoder.encode(body),
    );
    if (!ok) return null;

    const json = new TextDecoder().decode(b64urlDecode(body));
    const payload = JSON.parse(json) as SessionPayload;
    if (payload.v !== 1 || typeof payload.exp !== 'number') return null;
    if (Math.floor(Date.now() / 1000) >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * 校验 Authorization：
 * 1) 有效 session token
 * 2) 兼容旧版：Bearer 明文密码（便于过渡；建议客户端尽快换 token）
 */
export async function authorize(
  authHeader: string | undefined,
  secret: string | undefined,
): Promise<boolean> {
  if (!authHeader || !secret) return false;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return false;
  if (token === secret) return true;
  const session = await verifyToken(token, secret);
  return Boolean(session);
}
