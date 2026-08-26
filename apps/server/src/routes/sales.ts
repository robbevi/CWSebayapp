import { Router } from 'express';
import { isGoogleConfigured } from '../config/env.js';
import { fetchListings } from '../ebay/listingsService.js';
import { fetchSales, isEbayConfigured } from '../ebay/ordersService.js';
import {
  getAllParts,
  getListings,
  getSales,
  replaceListings,
  updatePart,
  upsertSales,
} from '../google/sheetsService.js';

export const salesRouter = Router();

// How far back a sync with no explicit window reaches. Comfortably longer than any gap
// between runs, and re-reading a sale is harmless because the write is keyed on line item.
const DEFAULT_LOOKBACK_DAYS = 30;
// eBay's order search won't accept an unbounded window.
const MAX_LOOKBACK_DAYS = 365;

/**
 * Fills in the eBay listing id on any part whose SKU matches a live listing's Custom
 * Label, so listing something does not also mean copying an id into the app by hand.
 *
 * Only ever fills a blank: a part that already carries a listing id is left alone, so a
 * relisted item keeps whatever it was deliberately pointed at.
 */
async function linkListingsToParts(active: { ebayListingId: string; sku: string }[]): Promise<number> {
  const withLabel = active.filter((l) => l.sku);
  if (withLabel.length === 0) return 0;

  const parts = await getAllParts();
  const taken = new Set(parts.map((p) => p.ebayListingId).filter((v): v is string => !!v));
  const bySku = new Map<string, typeof parts>();
  for (const p of parts) {
    const key = p.sku.toUpperCase();
    const bucket = bySku.get(key);
    if (bucket) bucket.push(p);
    else bySku.set(key, [p]);
  }

  let linked = 0;
  for (const l of withLabel) {
    if (taken.has(l.ebayListingId)) continue;
    const target = bySku.get(l.sku.toUpperCase())?.find((p) => !p.ebayListingId);
    if (!target) continue;
    await updatePart(target.id, { ebayListingId: l.ebayListingId, itemListed: true });
    taken.add(l.ebayListingId);
    linked++;
  }
  return linked;
}

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

    // Listings ride along with the same button. A failure here must not lose the sales
    // that were just written, so it is reported rather than thrown.
    let listings = 0;
    let linked = 0;
    let listingsError: string | undefined;
    try {
      const active = await fetchListings();
      listings = await replaceListings(active);
      linked = await linkListingsToParts(active);
    } catch (err) {
      listingsError = err instanceof Error ? err.message : String(err);
      console.warn('[ebay] Listing sync failed:', listingsError);
    }

    res.json({
      ...result,
      fetched: sales.length,
      estimatedFees: sales.filter((s) => s.feesEstimated).length,
      listings,
      linked,
      listingsError,
      since: since.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
