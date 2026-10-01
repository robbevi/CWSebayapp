import { Router, type NextFunction, type Response } from 'express';
import { coerceAgentListing, groupPartsBySku, type ListingCheck, type PublishResult } from '@warehouse/shared';
import { clearDraft, DraftTooLargeError, getDraft, saveDraft } from '../ebay/draftStore.js';
import { env } from '../config/env.js';
import { isEbayConfigured } from '../ebay/ordersService.js';
import { requireAdmin } from '../middleware/auth.js';
import { HttpError, prepareListing } from '../ebay/listingPrep.js';
import {
  getSellerSetup,
  ListingRejectedError,
  publishListing,
  suggestCategories,
  verifyListing,
} from '../ebay/publishService.js';
import { getAllParts, updatePart } from '../google/sheetsService.js';

export const ebayListingRouter = Router();

// Switched off, these routes don't exist: nothing reachable can list, or even look up the
// account's policies.
ebayListingRouter.use(['/ebay/seller-setup', '/ebay/category-suggestions', '/parts/:id/listing'], (_req, res, next) => {
  if (env.ebayPublishing) next();
  else res.status(404).json({ error: 'eBay publishing is not enabled here.' });
});

/** Parts mid-publish, so a double tap can't list the same stock twice. */
const publishing = new Set<string>();
/**
 * Parts published in the last few minutes. A second request can read the sheet before the
 * first one's listing ID is written and still be preparing after the first has finished;
 * this catches it where the in-flight set no longer can.
 */
const recentlyPublished = new Map<string, number>();
const RECENT_MS = 10 * 60_000;

function fail(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
  } else if (err instanceof ListingRejectedError) {
    res.status(422).json({ error: err.message, messages: err.messages });
  } else {
    next(err);
  }
}

ebayListingRouter.get('/ebay/seller-setup', async (_req, res, next) => {
  try {
    if (!isEbayConfigured()) {
      res.status(503).json({ error: 'eBay is not connected.' });
      return;
    }
    res.json(await getSellerSetup());
  } catch (err) {
    next(err);
  }
});

/** eBay categories near the agent's recommendation, best match first. */
ebayListingRouter.get('/ebay/category-suggestions', async (req, res, next) => {
  try {
    const title = typeof req.query.title === 'string' ? req.query.title : '';
    const path = typeof req.query.path === 'string' ? req.query.path : '';
    if (!title.trim() && !path.trim()) {
      res.status(400).json({ error: 'Nothing to search for.' });
      return;
    }
    res.json(await suggestCategories(title, path));
  } catch (err) {
    next(err);
  }
});

async function skuOf(partId: string): Promise<string> {
  const group = groupPartsBySku(await getAllParts()).find((g) => g.records.some((r) => r.id === partId));
  if (!group) throw new HttpError(404, 'Part not found.');
  return group.sku;
}

/**
 * The listing someone is working on for this part, wherever they started it. Saved as
 * they go, so the tablet and the desk see the same price, and a batch plans from it.
 */
ebayListingRouter.get('/parts/:id/listing/draft', async (req, res, next) => {
  try {
    res.json((await getDraft(await skuOf(String(req.params.id)))) ?? null);
  } catch (err) {
    fail(err, res, next);
  }
});

ebayListingRouter.put('/parts/:id/listing/draft', async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { listing?: unknown; notes?: unknown };
    if (!body.listing) throw new HttpError(400, 'No listing was sent.');
    const notes = Array.isArray(body.notes) ? body.notes.filter((n): n is string => typeof n === 'string') : [];
    const sku = await skuOf(String(req.params.id));
    res.json(await saveDraft(sku, coerceAgentListing(body.listing), notes, req.user?.name ?? ''));
  } catch (err) {
    if (err instanceof DraftTooLargeError) res.status(413).json({ error: err.message });
    else fail(err, res, next);
  }
});

ebayListingRouter.delete('/parts/:id/listing/draft', async (req, res, next) => {
  try {
    await clearDraft(await skuOf(String(req.params.id)));
    res.json({ ok: true });
  } catch (err) {
    fail(err, res, next);
  }
});

/** eBay's verdict on the listing as it stands, with fees. Nothing is listed. */
ebayListingRouter.post('/parts/:id/listing/verify', async (req, res, next) => {
  try {
    const { input, problems, conditionLabel } = await prepareListing(String(req.params.id), req.body);
    const outcome = await verifyListing(input);
    const body: ListingCheck = {
      ...outcome,
      ok: outcome.ok && problems.length === 0,
      problems,
      preview: {
        quantity: input.quantity,
        condition: conditionLabel,
        photoCount: input.imageUrls.length,
        shipFrom: input.shipFrom,
      },
    };
    res.json(body);
  } catch (err) {
    fail(err, res, next);
  }
});

/** Puts the listing live, and records its ID against the part. */
// Admins only: publishing puts real stock on sale. Checking with eBay stays open to all.
ebayListingRouter.post('/parts/:id/listing/publish', requireAdmin, async (req, res, next) => {
  let sku: string | undefined;
  try {
    const { group, input, problems } = await prepareListing(String(req.params.id), req.body);
    if (problems.length) throw new HttpError(422, problems.join(' '));
    for (const [key, at] of recentlyPublished) if (Date.now() - at > RECENT_MS) recentlyPublished.delete(key);
    if (publishing.has(group.sku) || recentlyPublished.has(group.sku)) {
      throw new HttpError(409, 'This part is already being published.');
    }
    sku = group.sku;
    publishing.add(sku);

    const listed = await publishListing(input);
    const scheduledFor = input.scheduleTime;
    recentlyPublished.set(group.sku, Date.now());
    // Listed now, so the draft has done its job; left behind, it would be planned again.
    await clearDraft(group.sku).catch(() => undefined);
    const submittedBy = req.user?.name;

    // The listing is live whatever happens next, so a failed write must not read as a
    // failed publish. The SKU is set as the listing's Custom Label, so the next sync
    // links it even if this write never lands.
    let recorded = true;
    let note: string | undefined;
    try {
      await updatePart(
        group.primary.id,
        { ebayListingId: listed.itemId, itemListed: true, itemListedDate: new Date().toISOString() },
        submittedBy
      );
    } catch (err) {
      recorded = false;
      note = `the next eBay sync will link it (${err instanceof Error ? err.message : 'write failed'})`;
    }

    const body: PublishResult = { ...listed, recorded, note, scheduledFor };
    res.json(body);
  } catch (err) {
    fail(err, res, next);
  } finally {
    if (sku) publishing.delete(sku);
  }
});
