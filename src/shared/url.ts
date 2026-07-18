/** URL 规范化与校验（前后端逻辑对齐） */

export type NormalizeResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export function normalizeUrl(raw: string): NormalizeResult {
  let t = (raw || '').trim();
  if (!t) return { ok: false, error: '网址不能为空' };

  // 去掉常见包裹
  t = t.replace(/^['"`]+|['"`]+$/g, '');

  if (/^(javascript|data|chrome|edge|about|place|file|vbscript):/i.test(t)) {
    return { ok: false, error: '不支持的网址协议' };
  }

  // 补协议
  if (!/^https?:\/\//i.test(t)) {
    t = `https://${t}`;
  }

  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return { ok: false, error: '网址格式不正确' };
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: '仅支持 http / https' };
  }
  if (!u.hostname || !u.hostname.includes('.')) {
    // 允许 localhost 开发
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
      return { ok: false, error: '请填写有效域名' };
    }
  }

  // 去掉默认端口、多余空白
  u.hash = '';
  // 保留 path/query；去掉末尾多余斜杠（根路径除外）
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.replace(/\/+$/, '');
  }

  return { ok: true, url: u.href };
}
