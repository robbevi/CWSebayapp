import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env, isGoogleConfigured } from '../config/env.js';
import { isEbayConfigured } from '../ebay/ordersService.js';
import { isStale, lastSync, syncSales } from '../ebay/salesSync.js';

export const cronRouter = Router();

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * The scheduler's wake-up call. The host sleeps when nobody is using SPARE, and a sleeping
 * server neither syncs on the hour nor sends the morning reminders; a scheduled flow
 * posting here wakes it and brings it up to date, which sends whatever emails are due.
 *
 * Open without signing in, so it needs SPARE_CRON_KEY in an X-Spare-Key header instead.
 */
cronRouter.post('/cron/sync', async (req, res, next) => {
  try {
    if (!env.cronKey) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!timingSafeEqual(digest(req.get('x-spare-key') ?? ''), digest(env.cronKey))) {
      res.status(401).json({ error: 'Wrong key.' });
      return;
    }
    if (!isEbayConfigured() || !isGoogleConfigured()) {
      res.status(503).json({ error: 'eBay or the data backend is not configured.' });
      return;
    }
    if (!isStale()) {
      res.json({ synced: false, lastSyncedAt: lastSync() });
      return;
    }
    const result = await syncSales();
    res.json({ synced: true, lastSyncedAt: lastSync(), added: result.added, notified: result.notified, reminded: result.reminded });
  } catch (err) {
    next(err);
  }
});
