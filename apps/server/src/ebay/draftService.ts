import type { ListingDraft } from '@warehouse/shared';
import { env } from '../config/env.js';
import { ebayBaseUrl, getAccessToken } from './client.js';

/**
 * Creates a draft listing on eBay.
 *
 * Uses the Listing API's item draft rather than building an unpublished offer through the
 * Inventory API. Two reasons: eBay infers the category and applies the seller's default
 * policies, neither of which this app holds, and the result lands in the seller's own
 * drafts where they already work. It also means nothing this app does can put a listing
 * live — publishing stays a deliberate act on eBay.
 */

export interface DraftResult {
  itemDraftId: string;
  /** Where to open it on eBay. Absent if eBay stops returning one. */
  url: string | null;
}

export async function createItemDraft(draft: ListingDraft): Promise<DraftResult> {
  const token = await getAccessToken();

  const body: Record<string, unknown> = {
    marketplaceId: env.ebayMarketplaceId,
    format: 'FIXED_PRICE',
    sku: draft.sku,
    condition: draft.condition,
    conditionDescription: draft.conditionDescription,
    product: {
      title: draft.title,
      description: draft.descriptionHtml,
      imageUrls: draft.imageUrls,
      ...(draft.brand ? { brand: draft.brand } : {}),
      mpn: draft.mpn,
    },
    availability: { shipToLocationAvailability: { quantity: draft.quantity } },
  };

  // Left out entirely when unknown, so eBay treats it as unset rather than as zero — a
  // draft priced at nothing is worse than a draft waiting for a price.
  if (draft.price != null) {
    body.pricingSummary = { price: { value: draft.price.toFixed(2), currency: 'USD' } };
  }

  const res = await fetch(`${ebayBaseUrl()}/sell/listing/v1_beta/item_draft`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Content-Language': 'en-US',
      'X-EBAY-C-MARKETPLACE-ID': env.ebayMarketplaceId,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    // A 404 with no body is the gateway declining to route, not a missing record: the
    // Listing API is a Limited Release and this app is not on the approved list. Probed
    // 2026-08-25 — both v1_beta and v1 answered 404 while the Inventory API on the same
    // token answered with a proper error body, so the token is fine and the route is not.
    const hint =
      res.status === 403
        ? ' The token has no sell.item.draft scope — re-run scripts/ebay-oauth-setup.ts to grant it.'
        : res.status === 404
          ? ' The Listing API is a Limited Release; this app has not been approved for it, so the route does not exist. Apply through the eBay Developers Program before using this.'
          : '';
    throw new Error(`eBay draft creation failed (${res.status}).${hint} ${text.slice(0, 400)}`);
  }

  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  const id = String(json.itemDraftId ?? json.draftId ?? '');
  // eBay returns the location of the new draft in a header when the body omits it.
  const url =
    (typeof json.itemPreviewUrl === 'string' && json.itemPreviewUrl) ||
    (typeof json.listingUrl === 'string' && json.listingUrl) ||
    res.headers.get('location') ||
    (id ? `https://www.ebay.com/sl/list?mode=ReviseItem&itemId=${id}` : null);

  return { itemDraftId: id, url };
}
