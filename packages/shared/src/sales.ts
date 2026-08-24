import type { PartGroup } from './grouping.js';

/**
 * One sold line item. Sales are a log rather than fields on a part: most listings carry
 * several units, so the same listing sells partially and repeatedly, and each of those is
 * its own event with its own date and proceeds.
 */
export interface Sale {
  /** eBay's order line item id. The dedupe key — re-syncing must never double-count. */
  lineItemId: string;
  orderId: string;
  soldAt: string;
  /** eBay listing id (legacyItemId), the primary join back to a part. */
  ebayListingId: string;
  sku: string;
  qtySold: number;
  /** What the buyer paid for the items themselves. */
  grossSale: number;
  shipping: number;
  /** Sales tax eBay collects and remits. Never the seller's money, so it is not proceeds. */
  tax: number;
  fees: number;
  /** Gross plus shipping less fees — what actually lands in the account. */
  netProceeds: number;
  currency: string;
  /** True when fees were estimated rather than read from eBay's finance records. */
  feesEstimated: boolean;
  syncedAt: string;
}

export interface SaleTotals {
  orders: number;
  qty: number;
  gross: number;
  net: number;
}

export const EMPTY_SALE_TOTALS: SaleTotals = { orders: 0, qty: 0, gross: 0, net: 0 };

export function totalsFor(sales: Sale[]): SaleTotals {
  const totals = { orders: sales.length, qty: 0, gross: 0, net: 0 };
  for (const s of sales) {
    totals.qty += s.qtySold;
    totals.gross += s.grossSale;
    totals.net += s.netProceeds;
  }
  return totals;
}

export interface SalesIndex {
  byListing: Map<string, Sale[]>;
  bySku: Map<string, Sale[]>;
}

function push(map: Map<string, Sale[]>, key: string, sale: Sale): void {
  const existing = map.get(key);
  if (existing) existing.push(sale);
  else map.set(key, [sale]);
}

export function indexSales(sales: Sale[]): SalesIndex {
  const byListing = new Map<string, Sale[]>();
  const bySku = new Map<string, Sale[]>();
  for (const s of sales) {
    if (s.ebayListingId) push(byListing, s.ebayListingId, s);
    if (s.sku) push(bySku, s.sku.toUpperCase(), s);
  }
  return { byListing, bySku };
}

/**
 * Sales belonging to a part. Listing id wins because it is exact and every listed part
 * already has one; SKU is the fallback for a sale whose listing id didn't come through.
 */
export function salesForGroup(group: PartGroup, index: SalesIndex): Sale[] {
  const ids = new Set(
    group.records.map((r) => r.ebayListingId).filter((v): v is string => !!v)
  );
  const matched = new Map<string, Sale>();
  for (const id of ids) {
    for (const sale of index.byListing.get(id) ?? []) matched.set(sale.lineItemId, sale);
  }
  for (const sale of index.bySku.get(group.sku.toUpperCase()) ?? []) {
    matched.set(sale.lineItemId, sale);
  }
  return [...matched.values()].sort((a, b) => b.soldAt.localeCompare(a.soldAt));
}

export interface SoldPosition {
  soldQty: number;
  /** Quantity still on the shelf. Never negative, even if eBay reports more sold. */
  remainingQty: number;
  /** Every unit accounted for — the listing has nothing left to sell. */
  soldOut: boolean;
  totals: SaleTotals;
}

export function soldPosition(group: PartGroup, sales: Sale[]): SoldPosition {
  const totals = totalsFor(sales);
  const stock = group.stockQty;
  return {
    soldQty: totals.qty,
    remainingQty: Math.max(0, stock - totals.qty),
    soldOut: totals.qty > 0 && totals.qty >= stock,
    totals,
  };
}


/**
 * The listing ids and SKUs the app knows about. A sale is "tracked" when it can be tied
 * to a part on the board; anything else is real revenue the app has no record behind —
 * typically an item sold before it was ever catalogued here.
 */
export interface TrackedKeys {
  listingIds: Set<string>;
  skus: Set<string>;
}

export function trackedKeys(groups: PartGroup[]): TrackedKeys {
  const listingIds = new Set<string>();
  const skus = new Set<string>();
  for (const g of groups) {
    skus.add(g.sku.toUpperCase());
    for (const r of g.records) if (r.ebayListingId) listingIds.add(r.ebayListingId);
  }
  return { listingIds, skus };
}

export function isSaleTracked(sale: Sale, keys: TrackedKeys): boolean {
  if (sale.ebayListingId && keys.listingIds.has(sale.ebayListingId)) return true;
  return !!sale.sku && keys.skus.has(sale.sku.toUpperCase());
}
