import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * PINs are short, so the hash is only half the protection; the other half is refusing to
 * be guessed at. A PIN is never stored, only a salted scrypt hash of it.
 */

export const PIN_PATTERN = /^\d{4,6}$/;

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && PIN_PATTERN.test(pin);
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `s1$${salt.toString('base64')}$${scryptSync(pin, salt, 32).toString('base64')}`;
}

export function verifyPin(pin: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 's1' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = scryptSync(pin, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(expected, actual);
}

const MAX_FAILURES = 5;
export const LOCK_MS = 15 * 60 * 1000;

/**
 * Wrong-PIN tracking per name. Five misses locks that name for fifteen minutes; the right
 * PIN clears the count. Kept in memory: a restart forgiving a lock is an acceptable cost
 * for not writing every miss to the sheet.
 */
export class Lockout {
  private failures = new Map<string, { count: number; lockedUntil: number }>();

  /** Milliseconds left on a lock, or 0 when the name may try. */
  lockedFor(name: string, now = Date.now()): number {
    const f = this.failures.get(name);
    return f && f.lockedUntil > now ? f.lockedUntil - now : 0;
  }

  fail(name: string, now = Date.now()): void {
    const f = this.failures.get(name);
    const count = (f && f.lockedUntil <= now && f.lockedUntil !== 0 ? 0 : (f?.count ?? 0)) + 1;
    this.failures.set(name, { count, lockedUntil: count >= MAX_FAILURES ? now + LOCK_MS : 0 });
  }

  succeed(name: string): void {
    this.failures.delete(name);
  }
}
