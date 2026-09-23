import {
  coerceAgentListing,
  draftReadiness,
  fillFromPart,
  groupPartsBySku,
  listingProblems,
  researchMismatch,
  scheduleProblem,
  tradingCondition,
  type PartGroup,
  type PolicyChoice,
} from '@warehouse/shared';
import { env, isGoogleConfigured } from '../config/env.js';
import { isEbayConfigured } from './ordersService.js';
import { getSellerSetup, type PublishInput } from './publishService.js';
import { getAllParts } from '../google/sheetsService.js';

/**
 * Turning a part and an agent's listing into something eBay will accept.
 *
 * Shared by the one-at-a-time publisher and the queue that schedules a week of listings,
 * so both refuse the same things for the same reasons: already listed, not ready, a
 * condition eBay has no name for, nothing counted, or research written for another SKU.
 */

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// eBay fetches the photographs itself. They are served by the deployed app whichever
// server builds the listing, so a local run still hands eBay addresses it can reach.
const PHOTO_BASE = env.publicBaseUrl ?? 'https://calfracusebayinventoryapp.onrender.com';
// eBay's limit for a fixed-price listing.
const MAX_PICTURES = 24;

const NEEDS: Record<string, string> = {
  'no photographs': 'photographs',
  'quantity not confirmed': 'a counted quantity',
  'no item condition': 'an item condition',
  'nothing to build a title from': 'a description',
};

export interface PreparedListing {
  group: PartGroup;
  input: PublishInput;
  problems: string[];
  conditionLabel: string;
}

export interface PrepareBody {
  listing?: unknown;
  policies?: Partial<PolicyChoice>;
  scheduleTime?: unknown;
}

/** Everything the caller needs before publishing, or an HttpError saying what is missing. */
export async function prepareListing(
  partId: string,
  body: PrepareBody | undefined,
  groups?: PartGroup[]
): Promise<PreparedListing> {
  if (!isEbayConfigured()) throw new HttpError(503, 'eBay is not connected.');
  if (!isGoogleConfigured()) throw new HttpError(503, 'No data backend is configured for this environment.');

  const b = body ?? {};
  if (!b.listing) throw new HttpError(400, 'No listing was sent.');

  // A start time is optional. eBay then holds the listing under Scheduled in Seller Hub,
  // which is where a last look before it goes live can happen.
  let scheduleTime: string | undefined;
  if (b.scheduleTime != null && b.scheduleTime !== '') {
    if (typeof b.scheduleTime !== 'string') throw new HttpError(400, 'That is not a time eBay can read.');
    const problem = scheduleProblem(b.scheduleTime);
    if (problem) throw new HttpError(400, problem);
    scheduleTime = new Date(b.scheduleTime).toISOString();
  }

  // The queue prepares many parts at once and passes the groups it already read, rather
  // than fetching the whole sheet per listing.
  const all = groups ?? groupPartsBySku(await getAllParts());
  const group = all.find((g) => g.records.some((r) => r.id === partId));
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
  const mismatch = researchMismatch(listing, group.sku);
  if (mismatch) throw new HttpError(422, mismatch);
  return {
    group,
    problems: listingProblems(listing),
    conditionLabel: condition.label,
    input: {
      listing,
      scheduleTime,
      sku: group.sku,
      quantity,
      conditionId: condition.id,
      imageUrls: group.photos.slice(0, MAX_PICTURES).map((p) => `${PHOTO_BASE}${p.url}`),
      policies,
      shipFrom: setup.shipFrom,
    },
  };
}
