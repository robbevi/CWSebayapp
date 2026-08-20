import { Router } from 'express';
import { isGoogleConfigured } from '../config/env.js';
import { fetchSales, isEbayConfigured } from '../ebay/ordersService.js';
import { getSales, upsertSales } from '../google/sheetsService.js';

export const salesRouter = Router();

// How far back a sync with no explicit window reaches. Comfortably longer than any gap
// between runs, and re-reading a sale is harmless because the write is keyed on line item.
const DEFAULT_LOOKBACK_DAYS = 30;
// eBay's order search won't accept an unbounded window.
const MAX_LOOKBACK_DAYS = 365;

salesRouter.get('/sales', async (_req, res, next) => {
  try {
    if (!isGoogleConfigured()) {
      res.json([]);
      return;
    }
    res.json(await getSales());
  } catch (err) {
    next(err);
  }
});

salesRouter.get('/sales/status', (_req, res) => {
  res.json({ ebayConfigured: isEbayConfigured() });
});

/**
 * Pulls recent orders from eBay into the Sales tab. Safe to call repeatedly: the write is
 * keyed on eBay's line item id, so an overlapping window updates rather than duplicates.
 */
salesRouter.post('/sales/sync', async (req, res, next) => {
  try {
    if (!isEbayConfigured()) {
      res.status(503).json({
        error:
          'eBay is not connected. Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET and EBAY_REFRESH_TOKEN, then restart.',
      });
      return;
    }
    if (!isGoogleConfigured()) {
      res.status(503).json({ error: 'No data backend is configured for this environment.' });
      return;
    }

    const requested = Number((req.body as { days?: number } | undefined)?.days ?? DEFAULT_LOOKBACK_DAYS);
    const days = Math.min(MAX_LOOKBACK_DAYS, Math.max(1, Number.isFinite(requested) ? requested : DEFAULT_LOOKBACK_DAYS));
    const since = new Date(Date.now() - days * 86_400_000);

    const sales = await fetchSales(since);
    const result = await upsertSales(sales);
    res.json({
      ...result,
      fetched: sales.length,
      estimatedFees: sales.filter((s) => s.feesEstimated).length,
      since: since.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
