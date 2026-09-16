import { Router, type NextFunction, type Response } from 'express';
import {
  coerceAgentListing,
  draftReadiness,
  fillFromPart,
  groupPartsBySku,
  listingProblems,
  tradingCondition,
  type ListingCheck,
  type PartGroup,
  type PolicyChoice,
  type PublishResult,
} from '@warehouse/shared';
import { env, isGoogleConfigured } from '../config/env.js';
import { isEbayConfigured } from '../ebay/ordersService.js';
import {
  getSellerSetup,
  ListingRejectedError,
  publishListing,
  verifyListing,
  type PublishInput,
} from '../ebay/publishService.js';
import { getAllParts, updatePart } from '../google/sheetsService.js';

export const ebayListingRouter = Router();

// Switched off, these routes don't exist: nothing reachable can list, or even look up the
// account's policies.
ebayListingRouter.use(['/ebay/seller-setup', '/parts/:id/listing'], (_req, res, next) => {
  if (env.ebayPublishing) next();
  else res.status(404).json({ error: 'eBay publishing is not enabled here.' });
});

// eBay fetches the photographs itself. They are served by the deployed app whichever
// server builds the listing, so a local run still hands eBay addresses it can reach.
const PHOTO_BASE = env.publicBaseUrl ?? 'https://calfracusebayinventoryapp.onrender.com';
// eBay's limit for a fixed-price listing.
const MAX_PICTURES = 24;

/** Parts mid-publish, so a double tap can't list the same stock twice. */
const publishing = new Set<string>();
/**
 * Parts published in the last few minutes. A second request can read the sheet before the
 * first one's listing ID is written and still be preparing after the first has finished;
 * this catches it where the in-flight set no longer can.
 */
const recentlyPublished = new Map<string, number>();
const RECENT_MS = 10 * 60_000;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function fail(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
  } else if (err instanceof ListingRejectedError) {
    res.status(422).json({ error: err.message, messages: err.messages });
  } else {
    next(err);
  }
}

const NEEDS: Record<string, string> = {
  'no photographs': 'photographs',
  'quantity not confirmed': 'a counted quantity',
  'no item condition': 'an item condition',
  'nothing to build a title from': 'a description',
};

async function prepare(
  partId: string,
  body: unknown
): Promise<{ group: PartGroup; input: PublishInput; problems: string[]; conditionLabel: string }> {
  if (!isEbayConfigured()) throw new HttpError(503, 'eBay is not connected.');
  if (!isGoogleConfigured()) throw new HttpError(503, 'No data backend is configured for this environment.');

  const b = (body ?? {}) as { listing?: unknown; policies?: Partial<PolicyChoice> };
  if (!b.listing) throw new HttpError(400, 'No listing was sent.');

  const group = groupPartsBySku(await getAllParts()).find((g) => g.records.some((r) => r.id === partId));
  if (!group) throw new HttpError(404, 'Part not found.');

  const listed = group.records.find((r) => r.ebayListingId);
  if (listed || group.records.some((r) => r.itemListed)) {
    throw new HttpError(409, `This part is already listed on eBay${listed ? ` (${listed.ebayListingId})` : ''}.`);
  }
  const blockers = draftReadiness(group).blockers.filter((x) => x !== 'already listed on eBay');
  if (blockers.length) {
    throw new HttpError(422, `Listing needs ${blockers.map((x) => NEEDS[x] ?? x).join(', ')} first.`);
  }
  const condition = tradingCondition(group.itemCondition);
  if (!condition) throw new HttpError(422, `eBay has no condition matching "${group.itemCondition}".`);
  const quantity = group.confirmedQoh ?? group.stockQty;
  if (quantity < 1) throw new HttpError(422, 'The counted quantity is zero — there is nothing to list.');

  const setup = await getSellerSetup();
  const policies: PolicyChoice = {
    shipping: b.policies?.shipping ?? '',
    returns: b.policies?.returns ?? '',
    payment: b.policies?.payment ?? '',
  };
  if (
    !setup.shipping.some((p) => p.id === policies.shipping) ||
    !setup.returns.some((p) => p.id === policies.returns) ||
    !setup.payment.some((p) => p.id === policies.payment)
  ) {
    throw new HttpError(400, 'Choose a shipping, return and payment policy.');
  }
  if (!setup.shipFrom) {
    throw new HttpError(503, "Couldn't find a ship-from address on any current listing to copy.");
  }

  const listing = fillFromPart(coerceAgentListing(b.listing), group);
  return {
    group,
    problems: listingProblems(listing),
    conditionLabel: condition.label,
    input: {
      listing,
      sku: group.sku,
      quantity,
      conditionId: condition.id,
      imageUrls: group.photos.slice(0, MAX_PICTURES).map((p) => `${PHOTO_BASE}${p.url}`),
      policies,
      shipFrom: setup.shipFrom,
    },
  };
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

/** eBay's verdict on the listing as it stands, with fees. Nothing is listed. */
ebayListingRouter.post('/parts/:id/listing/verify', async (req, res, next) => {
  try {
    const { input, problems, conditionLabel } = await prepare(req.params.id, req.body);
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
ebayListingRouter.post('/parts/:id/listing/publish', async (req, res, next) => {
  let sku: string | undefined;
  try {
    const { group, input, problems } = await prepare(req.params.id, req.body);
    if (problems.length) throw new HttpError(422, problems.join(' '));
    for (const [key, at] of recentlyPublished) if (Date.now() - at > RECENT_MS) recentlyPublished.delete(key);
    if (publishing.has(group.sku) || recentlyPublished.has(group.sku)) {
      throw new HttpError(409, 'This part is already being published.');
    }
    sku = group.sku;
    publishing.add(sku);

    const listed = await publishListing(input);
    recentlyPublished.set(group.sku, Date.now());
    const submittedBy = typeof req.body?.submittedBy === 'string' ? req.body.submittedBy : undefined;

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

    const body: PublishResult = { ...listed, recorded, note };
    res.json(body);
  } catch (err) {
    fail(err, res, next);
  } finally {
    if (sku) publishing.delete(sku);
  }
});
