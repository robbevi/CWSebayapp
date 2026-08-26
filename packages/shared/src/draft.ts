import type { PartGroup } from './grouping.js';
import { getCheckpoints } from './status.js';

/**
 * Turning a catalogued part into something eBay will accept as a draft.
 *
 * Composition is kept here, away from the API call, because what makes a good listing is a
 * domain question — how a title reads, which condition maps to which — and it should be
 * testable without touching eBay.
 */

/** eBay's condition values, as the Listing API expects them. */
export type EbayCondition =
  | 'NEW'
  | 'LIKE_NEW'
  | 'USED_EXCELLENT'
  | 'USED_VERY_GOOD'
  | 'USED_GOOD'
  | 'USED_ACCEPTABLE'
  | 'FOR_PARTS_OR_NOT_WORKING';

/**
 * Our warehouse conditions onto eBay's. Deliberately conservative at the bottom end: a
 * part described as Poor is likelier to disappoint than delight, and an over-claimed
 * condition is the fastest route to a return.
 */
const CONDITION_MAP: Record<string, EbayCondition> = {
  New: 'NEW',
  'Like New': 'LIKE_NEW',
  Good: 'USED_GOOD',
  Fair: 'USED_ACCEPTABLE',
  Poor: 'FOR_PARTS_OR_NOT_WORKING',
  'For Parts': 'FOR_PARTS_OR_NOT_WORKING',
};

export function toEbayCondition(itemCondition: string | undefined): EbayCondition | null {
  if (!itemCondition) return null;
  return CONDITION_MAP[itemCondition.trim()] ?? null;
}

/** eBay rejects a title over 80 characters. */
export const MAX_TITLE = 80;

/**
 * Builds a title from what a buyer searches for: brand, what the thing is, then the part
 * number. Truncated on a word boundary so it never ends mid-word, and de-duplicated
 * because descriptions here often already carry the manufacturer in brackets.
 */
export function buildTitle(group: Pick<PartGroup, 'sku' | 'description' | 'manufacturer'>): string {
  const seen = new Set<string>();
  const words: string[] = [];

  const push = (text: string) => {
    for (const raw of text.split(/\s+/)) {
      const word = raw.replace(/[(),]/g, '').trim();
      if (!word) continue;
      const key = word.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      words.push(word);
    }
  };

  // Manufacturer first, but only when it says something: "Not Available" is a placeholder
  // in this data, not a brand.
  const brand = group.manufacturer?.trim();
  if (brand && !/^not available$/i.test(brand)) push(brand);
  if (group.description?.trim()) push(group.description);
  push(group.sku);

  let title = '';
  for (const word of words) {
    const next = title ? `${title} ${word}` : word;
    if (next.length > MAX_TITLE) break;
    title = next;
  }
  return title;
}

export interface DraftPhoto {
  url: string;
}

export interface ListingDraft {
  sku: string;
  title: string;
  condition: EbayCondition;
  conditionDescription: string;
  descriptionHtml: string;
  imageUrls: string[];
  quantity: number;
  /** Null when nothing in the data says what it is worth; the draft waits on a human. */
  price: number | null;
  brand: string | null;
  mpn: string;
}

export interface DraftReadiness {
  ready: boolean;
  /** What a person still has to supply. Empty when the draft can be built unattended. */
  missing: string[];
  /** Reasons a draft cannot be built at all, as opposed to merely needing a price. */
  blockers: string[];
}

export function draftReadiness(group: PartGroup): DraftReadiness {
  const checks = getCheckpoints(group);
  const blockers: string[] = [];
  const missing: string[] = [];

  if (!checks.photographed || group.photos.length === 0) blockers.push('no photographs');
  if (!checks.qtyConfirmed) blockers.push('quantity not confirmed');
  if (!toEbayCondition(group.itemCondition)) blockers.push('no item condition');
  if (!buildTitle(group)) blockers.push('nothing to build a title from');
  if (checks.listed) blockers.push('already listed on eBay');

  // A missing price does not stop a draft: everything else is filled in and it waits.
  const price = priceFor(group);
  if (price == null) missing.push('price');

  return { ready: blockers.length === 0, missing, blockers };
}

function priceFor(group: PartGroup): number | null {
  const prices = group.records
    .map((r) => r.activeRecoveryPriceBasis)
    .filter((v): v is number => v != null && v > 0);
  return prices.length ? Math.max(...prices) : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Composes the draft. `imageBase` is the public origin eBay will fetch photographs from —
 * it has to reach us from the open internet, not from inside the network.
 */
export function composeDraft(group: PartGroup, imageBase: string): ListingDraft | null {
  const readiness = draftReadiness(group);
  if (!readiness.ready) return null;

  const condition = toEbayCondition(group.itemCondition)!;
  const brand = group.manufacturer?.trim();
  const usableBrand = brand && !/^not available$/i.test(brand) ? brand : null;

  const conditionParts = [group.itemCondition, group.boxCondition ? `Box: ${group.boxCondition}` : null]
    .filter(Boolean)
    .join('. ');

  const rows: [string, string][] = [
    ['Part number', group.sku],
    usableBrand ? ['Manufacturer', usableBrand] : null,
    ['Condition', group.itemCondition ?? ''],
    group.boxCondition ? ['Packaging', group.boxCondition] : null,
  ].filter((r): r is [string, string] => r !== null);

  const descriptionHtml =
    `<p>${escapeHtml(group.description || group.sku)}</p>` +
    '<ul>' +
    rows.map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</li>`).join('') +
    '</ul>' +
    '<p>Surplus stock. Photographs show the actual item.</p>';

  return {
    sku: group.sku,
    title: buildTitle(group),
    condition,
    conditionDescription: conditionParts,
    descriptionHtml,
    // Absolute, because eBay fetches these itself.
    imageUrls: group.photos.map((p) => `${imageBase.replace(/\/$/, '')}${p.url}`),
    quantity: group.confirmedQoh ?? group.stockQty,
    price: priceFor(group),
    brand: usableBrand,
    mpn: group.sku,
  };
}
