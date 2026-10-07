import type { NextFunction, Request, Response } from 'express';
import type { AppUser } from '@warehouse/shared';
import { env } from '../config/env.js';
import { readCookie, readSessionToken, SESSION_COOKIE } from '../auth/session.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The signed-in person, from their session cookie and the current roster. */
      user?: AppUser;
    }
  }
}

export function userFromRequest(req: Request): AppUser | undefined {
  const name = readSessionToken(readCookie(req.headers.cookie, SESSION_COOKIE));
  if (!name) return undefined;
  return env.appUsers.find((u) => u.name.toLowerCase() === name.toLowerCase());
}

/**
 * What stays reachable without signing in: the sign-in routes themselves, health checks,
 * and photographs — eBay fetches listing photos from these URLs on its own, and the sale
 * email's pictures are loaded by whoever opens it.
 */
function isPublic(req: Request): boolean {
  if (req.path.startsWith('/auth/') || req.path === '/health' || req.path.startsWith('/health/')) return true;
  return req.method === 'GET' && /^\/photos\/[^/]+\/(content|thumb)$/.test(req.path);
}

/** Mounted on /api: every other API route needs a signed-in person. */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (isPublic(req)) return next();
  const user = userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  req.user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.admin) {
    res.status(403).json({ error: 'Only an admin can do that.' });
    return;
  }
  next();
}
