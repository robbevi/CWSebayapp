import { Router } from 'express';
import { env } from '../config/env.js';
import { HttpError } from '../ebay/listingPrep.js';
import {
  buildPlan,
  MAX_DAYS,
  MAX_PER_DAY,
  queueStatus,
  startQueue,
  stopQueue,
  type QueueItem,
} from '../ebay/listingQueue.js';
import { requireAdmin } from '../middleware/auth.js';

export const listingQueueRouter = Router();

// Off, the queue doesn't exist — the same switch that hides publishing itself.
listingQueueRouter.use('/listing-queue', (_req, res, next) => {
  if (env.ebayPublishing) next();
  else res.status(404).json({ error: 'eBay publishing is not enabled here.' });
});

const clamp = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : fallback;
};

/** What SPARE would schedule. Reads only; nothing reaches eBay. */
listingQueueRouter.post('/listing-queue/plan', requireAdmin, async (req, res, next) => {
  try {
    const days = clamp(req.body?.days, 7, 1, MAX_DAYS);
    const perDay = clamp(req.body?.perDay, 10, 1, MAX_PER_DAY);
    const hour = clamp(req.body?.hour, 9, 0, 23);
    const startDate = typeof req.body?.startDate === 'string' ? req.body.startDate : undefined;
    res.json(await buildPlan(days, perDay, hour, new Date(), startDate));
  } catch (err) {
    next(err);
  }
});

listingQueueRouter.get('/listing-queue/status', requireAdmin, (_req, res) => {
  res.json(queueStatus());
});

/** Schedules an approved batch on eBay. Admins only: this puts real stock on sale. */
listingQueueRouter.post('/listing-queue/schedule', requireAdmin, async (req, res, next) => {
  try {
    const items = (req.body?.items ?? []) as QueueItem[];
    if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'Nothing to schedule.');
    if (items.some((i) => !i.policies?.shipping || !i.policies?.returns || !i.policies?.payment)) {
      throw new HttpError(400, 'Every listing needs a shipping, return and payment policy.');
    }
    res.json(await startQueue(items, req.user!.name));
  } catch (err) {
    if (err instanceof HttpError) res.status(err.status).json({ error: err.message });
    else next(err);
  }
});

listingQueueRouter.post('/listing-queue/stop', requireAdmin, (_req, res) => {
  res.json(stopQueue());
});
