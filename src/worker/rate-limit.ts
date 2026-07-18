/** 简单进程内限流（单 Worker 隔离体有效，防爆破够用） */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 15 * 60 * 1000; // 15 分钟
const MAX_FAILS = 8;

export function clientKey(c: { req: { header: (n: string) => string | undefined } }): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b) return false;
  if (now >= b.resetAt) {
    buckets.delete(key);
    return false;
  }
  return b.count >= MAX_FAILS;
}

export function recordLoginFailure(key: string): { remaining: number; retryAfterSec: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + WINDOW_MS };
  }
  b.count += 1;
  buckets.set(key, b);
  return {
    remaining: Math.max(0, MAX_FAILS - b.count),
    retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
  };
}

export function clearLoginFailures(key: string) {
  buckets.delete(key);
}
