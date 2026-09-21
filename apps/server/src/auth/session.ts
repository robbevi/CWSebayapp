import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Signed session cookies. The cookie holds the signed-in name and an expiry, with an HMAC
 * over both, so the server needs no session store: it recomputes the signature and looks
 * the name up in the roster on every request — removing someone from APP_USERS_JSON
 * signs them out everywhere.
 */

export const SESSION_COOKIE = 'spare_session';
/** A shift and then some. Shared tablets switch user explicitly, not by timing out. */
export const SESSION_MS = 12 * 60 * 60 * 1000;

// Without SESSION_SECRET sessions still work, but every restart signs everyone out — and
// Render's free plan restarts often. Say so loudly rather than fail.
const secret =
  env.sessionSecret ??
  (() => {
    console.warn('SESSION_SECRET is not set: sessions will not survive a restart.');
    return randomBytes(32).toString('hex');
  })();

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');

export function createSessionToken(name: string, now = Date.now()): string {
  const payload = b64(JSON.stringify({ n: name, e: now + SESSION_MS }));
  return `${payload}.${sign(payload)}`;
}

/** The signed-in name, or null for a missing, tampered or expired token. */
export function readSessionToken(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { n, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { n?: unknown; e?: unknown };
    if (typeof n !== 'string' || typeof e !== 'number' || e < now) return null;
    return n;
  } catch {
    return null;
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i !== -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure}`;
}

export function clearedCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
