/**
 * A live eBay listing.
 *
 * Assembled from two sources because neither is complete: the Trading API knows watchers,
 * the current asking price and how many are left, while impressions and views only exist
 * in the Analytics traffic report. Neither knows what the other does.
 */
export interface Listing {
  ebayListingId: string;
  title: string;
  /** eBay's Custom Label. Set to the part SKU, it links a listing back without anyone
   *  copying an id by hand. Empty when the listing was created without one. */
  sku: string;
  /** What the listing is currently asking, which is not the same as the recovery basis. */
  price: number;
  currency: string;
  quantityAvailable: number;
  watchers: number;
  /** Traffic over the reporting window, absent when eBay has no data for the listing. */
  impressions: number | null;
  views: number | null;
  syncedAt: string;
}

export function indexListings(listings: Listing[]): Map<string, Listing> {
  return new Map(listings.map((l) => [l.ebayListingId, l]));
}

/** The listing behind a part, matched on the id the part already stores. */
export function listingFor(
  records: { ebayListingId?: string | null }[],
  index: Map<string, Listing>
): Listing | undefined {
  for (const r of records) {
    if (r.ebayListingId) {
      const hit = index.get(r.ebayListingId);
      if (hit) return hit;
    }
  }
  return undefined;
}

export interface ListingTotals {
  listings: number;
  watchers: number;
  impressions: number;
  views: number;
}

export function listingTotals(listings: Listing[]): ListingTotals {
  return listings.reduce(
    (acc, l) => ({
      listings: acc.listings + 1,
      watchers: acc.watchers + l.watchers,
      impressions: acc.impressions + (l.impressions ?? 0),
      views: acc.views + (l.views ?? 0),
    }),
    { listings: 0, watchers: 0, impressions: 0, views: 0 }
  );
}
