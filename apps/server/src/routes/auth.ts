import { Router, type Request, type Response } from 'express';
import type { AppUser } from '@warehouse/shared';
import { env } from '../config/env.js';
import { getAccess, getAccessRecords, setAccess } from '../auth/accessStore.js';
import { hashPin, isValidPin, Lockout, verifyPin } from '../auth/pins.js';
import { clearedCookie, createSessionToken, sessionCookie } from '../auth/session.js';
import { requireAdmin, userFromRequest } from '../middleware/auth.js';

export const authRouter = Router();

const lockout = new Lockout();

const findUser = (name: unknown): AppUser | undefined =>
  typeof name === 'string' ? env.appUsers.find((u) => u.name.toLowerCase() === name.trim().toLowerCase()) : undefined;

const me = (u: AppUser) => ({ name: u.name, role: u.role, admin: !!u.admin });

function signIn(res: Response, user: AppUser): void {
  res.setHeader('Set-Cookie', sessionCookie(createSessionToken(user.name)));
  res.json(me(user));
}

/** Names for the sign-in screen, and whether each can sign in or set up yet. */
authRouter.get('/auth/users', async (_req, res, next) => {
  try {
    const records = await getAccessRecords();
    res.json(
      env.appUsers.map((u) => {
        const hasPin = records.has(u.name.trim().toLowerCase());
        // Only an admin may create their own first PIN; everyone else is given one.
        return { name: u.name, hasPin, canSetUp: !hasPin && !!u.admin };
      })
    );
  } catch (err) {
    next(err);
  }
});

authRouter.get('/auth/me', (req, res) => {
  const user = userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }
  res.json(me(user));
});

authRouter.post('/auth/login', async (req: Request, res: Response, next) => {
  try {
    const user = findUser(req.body?.name);
    const pin = req.body?.pin;
    if (!user || !isValidPin(pin)) {
      res.status(400).json({ error: 'Choose your name and enter your 4–6 digit PIN.' });
      return;
    }
    const wait = lockout.lockedFor(user.name);
    if (wait) {
      res.status(429).json({ error: `Too many wrong PINs. Try again in ${Math.ceil(wait / 60000)} minutes.` });
      return;
    }
    const access = await getAccess(user.name);
    if (!access) {
      res.status(403).json({ error: 'No PIN has been set for you yet. Ask an admin to set one.' });
      return;
    }
    if (!verifyPin(pin, access.pinHash)) {
      lockout.fail(user.name);
      res.status(401).json({ error: 'That PIN is not right.' });
      return;
    }
    lockout.succeed(user.name);
    signIn(res, user);
  } catch (err) {
    next(err);
  }
});

/** An admin's first sign-in: they choose their own PIN, once. */
authRouter.post('/auth/setup', async (req, res, next) => {
  try {
    const user = findUser(req.body?.name);
    const pin = req.body?.pin;
    if (!user?.admin) {
      res.status(403).json({ error: 'Only an admin can set up their own PIN. Ask an admin to set yours.' });
      return;
    }
    if (!isValidPin(pin)) {
      res.status(400).json({ error: 'A PIN is 4–6 digits.' });
      return;
    }
    if (await getAccess(user.name)) {
      res.status(409).json({ error: 'You already have a PIN. Sign in with it.' });
      return;
    }
    await setAccess(user.name, hashPin(pin), user.name);
    signIn(res, user);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', clearedCookie());
  res.json({ ok: true });
});

/** Change your own PIN, proving the current one. */
authRouter.post('/auth/pin', async (req, res, next) => {
  try {
    const user = userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in to continue.' });
      return;
    }
    const { currentPin, newPin } = req.body ?? {};
    if (!isValidPin(newPin)) {
      res.status(400).json({ error: 'A PIN is 4–6 digits.' });
      return;
    }
    const access = await getAccess(user.name);
    if (!isValidPin(currentPin) || !verifyPin(currentPin, access?.pinHash)) {
      res.status(401).json({ error: 'Your current PIN is not right.' });
      return;
    }
    await setAccess(user.name, hashPin(newPin), user.name);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const adminOnly = [
  (req: Request, res: Response, next: () => void) => {
    const user = userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in to continue.' });
      return;
    }
    req.user = user;
    next();
  },
  requireAdmin,
];

authRouter.get('/auth/admin/users', ...adminOnly, async (_req, res, next) => {
  try {
    const records = await getAccessRecords();
    res.json(
      env.appUsers.map((u) => {
        const r = records.get(u.name.trim().toLowerCase());
        return { name: u.name, role: u.role, admin: !!u.admin, hasPin: !!r, setAt: r?.setAt || null, setBy: r?.setBy || null };
      })
    );
  } catch (err) {
    next(err);
  }
});

/** An admin sets or resets someone's PIN, and tells them what it is. */
authRouter.post('/auth/admin/pin', ...adminOnly, async (req, res, next) => {
  try {
    const target = findUser(req.body?.name);
    if (!target) {
      res.status(404).json({ error: 'No one by that name is on the roster.' });
      return;
    }
    if (!isValidPin(req.body?.pin)) {
      res.status(400).json({ error: 'A PIN is 4–6 digits.' });
      return;
    }
    await setAccess(target.name, hashPin(req.body.pin), req.user!.name);
    lockout.succeed(target.name);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
