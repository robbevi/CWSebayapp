import { Router } from 'express';
import { isCetarisSaleNumber } from '@warehouse/shared';
import { env, isGoogleConfigured } from '../config/env.js';
import { clearCetaris, getCetarisLogs, logCetaris } from '../google/cetarisStore.js';
import { isEbayConfigured } from '../ebay/ordersService.js';
import { DEFAULT_LOOKBACK_DAYS, isStale, lastSync, syncSales } from '../ebay/salesSync.js';
import { ordersToShip } from '../ebay/shipping.js';
import { getListings, getSales } from '../google/sheetsService.js';

export const salesRouter = Router();

salesRouter.get('/sales', async (_req, res, next) => {
  try {
    if (!isGoogleConfigured()) {
      res.json([]);
      return;
    }
    // Each sale carries its Cetaris number, when one has been logged, so the board and the
    // part both know which sales are finished.
    const [sales, logs] = await Promise.all([getSales(), getCetarisLogs()]);
    res.json(
      sales.map((sale) => {
        const log = logs.get(sale.lineItemId);
        return log
          ? { ...sale, cetarisSaleNumber: log.cetarisSaleNumber, cetarisLoggedAt: log.loggedAt, cetarisLoggedBy: log.loggedBy }
          : sale;
      })
    );
  } catch (err) {
    next(err);
  }
});

/**
 * Logs a Cetaris Part Sale number against one or more eBay sales. Anyone signed in: it is
 * logged by whoever did the Part Sale, and the log records who that was.
 */
salesRouter.post('/sales/cetaris', async (req, res, next) => {
  try {
    const number = String(req.body?.cetarisSaleNumber ?? '').trim();
    const ids = Array.isArray(req.body?.lineItemIds)
      ? (req.body.lineItemIds as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    if (!isCetarisSaleNumber(number)) {
      res.status(400).json({ error: 'A Cetaris Part Sale number is seven digits.' });
      return;
    }
    if (!ids.length) {
      res.status(400).json({ error: 'Choose the sales this Part Sale covers.' });
      return;
    }
    const known = new Map((await getSales()).map((s) => [s.lineItemId, s]));
    const sales = ids.map((id) => known.get(id)).filter((s): s is NonNullable<typeof s> => !!s);
    if (sales.length !== ids.length) {
      res.status(404).json({ error: 'One of those sales is no longer on record. Refresh and try again.' });
      return;
    }
    const logged = await logCetaris(
      sales.map((s) => ({ lineItemId: s.lineItemId, sku: s.sku })),
      number,
      req.user?.name ?? ''
    );
    res.json({ logged, cetarisSaleNumber: number });
  } catch (err) {
    next(err);
  }
});

salesRouter.delete('/sales/:lineItemId/cetaris', async (req, res, next) => {
  try {
    await clearCetaris(String(req.params.lineItemId));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

salesRouter.get('/listings', async (_req, res, next) => {
  try {
    if (!isGoogleConfigured()) {
      res.json([]);
      return;
    }
    res.json(await getListings());
  } catch (err) {
    next(err);
  }
});

salesRouter.get('/sales/status', (_req, res) => {
  res.json({
    ebayConfigured: isEbayConfigured(),
    ebayPublishing: isEbayConfigured() && env.ebayPublishing,
    research: !!env.researchUrl,
  });
});

/**
 * Pulls recent orders from eBay into the Sales tab. Safe to call repeatedly: the write is
 * keyed on eBay's line item id, so an overlapping window updates rather than duplicates.
 */
function syncProblem(): string | null {
  if (!isEbayConfigured()) {
    return 'eBay is not connected. Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET and EBAY_REFRESH_TOKEN, then restart.';
  }
  if (!isGoogleConfigured()) return 'No data backend is configured for this environment.';
  return null;
}

/** Orders eBay says haven't shipped, with what to pick and where they go. */
salesRouter.get('/orders/to-ship', async (_req, res, next) => {
  try {
    if (!isEbayConfigured()) {
      res.json([]);
      return;
    }
    res.json(await ordersToShip());
  } catch (err) {
    next(err);
  }
});

/** The Sync button: syncs now, however recently it last ran. */
salesRouter.post('/sales/sync', async (req, res, next) => {
  try {
    const problem = syncProblem();
    if (problem) {
      res.status(503).json({ error: problem });
      return;
    }
    const requested = Number((req.body as { days?: number } | undefined)?.days ?? DEFAULT_LOOKBACK_DAYS);
    res.json(await syncSales(requested));
  } catch (err) {
    next(err);
  }
});

/**
 * Made when someone opens the app: syncs unless one ran in the last couple of minutes,
 * so every sign-in brings SPARE up to date and a burst of them costs one sync.
 */
salesRouter.post('/sales/sync-if-stale', async (_req, res, next) => {
  try {
    if (syncProblem() || !isStale()) {
      res.json({ synced: false, lastSyncedAt: lastSync() });
      return;
    }
    const result = await syncSales();
    res.json({ synced: true, lastSyncedAt: lastSync(), ...result });
  } catch (err) {
    next(err);
  }
});
