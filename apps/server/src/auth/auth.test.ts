import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { hashPin, isValidPin, LOCK_MS, Lockout, verifyPin } from './pins.js';
import { createSessionToken, readCookie, readSessionToken, SESSION_MS } from './session.js';
import { requireAdmin, requireUser } from '../middleware/auth.js';

describe('session tokens', () => {
  it('round-trips a name', () => {
    expect(readSessionToken(createSessionToken('Rob Bevilacqua'))).toBe('Rob Bevilacqua');
  });

  it('rejects a token whose name was edited', () => {
    const [, mac] = createSessionToken('Bonnie Goga').split('.');
    const forged = Buffer.from(JSON.stringify({ n: 'Rob Bevilacqua', e: Date.now() + 1e6 })).toString('base64url');
    expect(readSessionToken(`${forged}.${mac}`)).toBeNull();
  });

  it('rejects a token with a made-up signature', () => {
    const [payload] = createSessionToken('Rob Bevilacqua').split('.');
    expect(readSessionToken(`${payload}.AAAA`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const issued = Date.now() - SESSION_MS - 1000;
    expect(readSessionToken(createSessionToken('Rob Bevilacqua', issued))).toBeNull();
  });

  it('rejects nothing and garbage', () => {
    expect(readSessionToken(undefined)).toBeNull();
    expect(readSessionToken('not-a-token')).toBeNull();
    expect(readSessionToken('a.b.c')).toBeNull();
  });

  it('reads the cookie out of a header', () => {
    expect(readCookie('a=1; spare_session=abc%2Edef; b=2', 'spare_session')).toBe('abc.def');
    expect(readCookie('a=1', 'spare_session')).toBeUndefined();
  });
});

describe('PINs', () => {
  it('accepts 4 to 6 digits only', () => {
    expect(['1234', '123456'].every(isValidPin)).toBe(true);
    expect(['123', '1234567', '12a4', '', 1234].some(isValidPin)).toBe(false);
  });

  it('verifies the right PIN and no other', () => {
    const stored = hashPin('4821');
    expect(verifyPin('4821', stored)).toBe(true);
    expect(verifyPin('4822', stored)).toBe(false);
  });

  it('salts every hash, so the same PIN never looks the same twice', () => {
    expect(hashPin('1111')).not.toBe(hashPin('1111'));
  });

  it('never verifies against a missing or malformed hash', () => {
    expect(verifyPin('1234', undefined)).toBe(false);
    expect(verifyPin('1234', 'plaintext-1234')).toBe(false);
  });
});

describe('lockout', () => {
  it('locks a name on the fifth wrong PIN, for fifteen minutes', () => {
    const l = new Lockout();
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) l.fail('Rob', t);
    expect(l.lockedFor('Rob', t)).toBe(0);
    l.fail('Rob', t);
    expect(l.lockedFor('Rob', t)).toBe(LOCK_MS);
    expect(l.lockedFor('Rob', t + LOCK_MS + 1)).toBe(0);
  });

  it('forgets misses once the right PIN is entered', () => {
    const l = new Lockout();
    for (let i = 0; i < 4; i++) l.fail('Rob');
    l.succeed('Rob');
    l.fail('Rob');
    expect(l.lockedFor('Rob')).toBe(0);
  });

  it('starts counting afresh after a lock expires', () => {
    const l = new Lockout();
    const t = 5_000_000;
    for (let i = 0; i < 5; i++) l.fail('Rob', t);
    l.fail('Rob', t + LOCK_MS + 1);
    expect(l.lockedFor('Rob', t + LOCK_MS + 1)).toBe(0);
  });

  it('keeps names separate', () => {
    const l = new Lockout();
    for (let i = 0; i < 5; i++) l.fail('Rob');
    expect(l.lockedFor('Bonnie')).toBe(0);
  });
});

function run(mw: (req: Request, res: Response, next: NextFunction) => void, req: Partial<Request>) {
  const res = { statusCode: 200, status: vi.fn(function (this: { statusCode: number }, c: number) { this.statusCode = c; return this; }), json: vi.fn() };
  const next = vi.fn();
  mw({ headers: {}, method: 'GET', ...req } as Request, res as unknown as Response, next);
  return { passed: next.mock.calls.length === 1, status: res.statusCode };
}

describe('the sign-in gate', () => {
  it('lets through sign-in, health checks and photo images', () => {
    expect(run(requireUser, { path: '/auth/login', method: 'POST' }).passed).toBe(true);
    expect(run(requireUser, { path: '/health' }).passed).toBe(true);
    expect(run(requireUser, { path: '/health/ebay' }).passed).toBe(true);
    expect(run(requireUser, { path: '/photos/abc123/content' }).passed).toBe(true);
  });

  it('turns everything else away without a session', () => {
    for (const [path, method] of [
      ['/parts', 'GET'],
      ['/parts/x', 'PATCH'],
      ['/photos', 'POST'],
      ['/photos/abc123', 'DELETE'],
      ['/parts/x/listing/publish', 'POST'],
      ['/export', 'GET'],
    ]) {
      expect(run(requireUser, { path, method }), `${method} ${path}`).toEqual({ passed: false, status: 401 });
    }
  });

  it('turns away a valid session for someone no longer on the roster', () => {
    const cookie = `spare_session=${createSessionToken('Nobody On The Roster')}`;
    expect(run(requireUser, { path: '/parts', headers: { cookie } })).toEqual({ passed: false, status: 401 });
  });

  it('keeps publishing to admins', () => {
    expect(run(requireAdmin, { user: { name: 'A', role: 'lister', admin: false } }).status).toBe(403);
    expect(run(requireAdmin, { user: { name: 'A', role: 'lister', admin: true } }).passed).toBe(true);
  });
});
