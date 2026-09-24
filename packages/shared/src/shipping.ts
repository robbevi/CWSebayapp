import type { AgentListing } from './agentListing.js';

/**
 * Whether a listing should carry free shipping or charge the buyer.
 *
 * Free shipping sells better and eBay ranks it higher, but it comes out of the recovery on
 * every sale — so it is offered where the postage is small against the price, and charged
 * where a heavy part would eat the margin. The agent estimates the packed weight, so this
 * is only ever a suggestion: every listing in a batch can be changed before it goes.
 */
export type ShippingChoice = 'free' | 'paid';

/** Above this, postage is no longer small change against a part's price. */
export const FREE_SHIPPING_MAX_LB = 5;
/** Below this, postage is most of what the part fetches. */
export const FREE_SHIPPING_MIN_PRICE = 25;

export function packedWeightLb(listing: Pick<AgentListing, 'weightLb' | 'weightOz'>): number | null {
  const { weightLb, weightOz } = listing;
  if (weightLb == null && weightOz == null) return null;
  return (weightLb ?? 0) + (weightOz ?? 0) / 16;
}

export function suggestShipping(listing: Pick<AgentListing, 'weightLb' | 'weightOz' | 'price'>): ShippingChoice {
  const weight = packedWeightLb(listing);
  // An unweighed part is charged: guessing free on something that turns out to be heavy
  // costs real money, where guessing paid only costs a little interest.
  if (weight == null) return 'paid';
  if (weight > FREE_SHIPPING_MAX_LB) return 'paid';
  if ((listing.price ?? 0) < FREE_SHIPPING_MIN_PRICE) return 'paid';
  return 'free';
}
