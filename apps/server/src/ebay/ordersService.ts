import type { Sale } from '@warehouse/shared';
import { env } from '../config/env.js';
import { ebayGet } from './client.js';

/**
 * Sales come from two eBay APIs, because neither alone is enough:
 *
 *  - Fulfillment (`/sell/fulfillment/v1/order`) has the line items — listing id, SKU,
 *    quantity and what the buyer paid. It does not carry the seller's fees.
 *  - Finances (`/sell/finances/v1/transaction`) has the fees actually charged per line
 *    item, which is what turns a gross sale into real proceeds.
 *
 * Orders are the source of truth for what sold; finance records enrich them. If the
 * finances scope is unavailable the sync still succeeds with fees estimated, flagged so
 * the figures are never silently presented as exact.
 */

const PAGE_SIZE = 200;
// eBay's US final value fee plus payment processing, roughly. Only used when a finance
// record hasn't landed yet — eBay posts them a little after the sale.
const ESTIMATED_FEE_RATE = 0.1325;

interface EbayAmount {
  value?: string;
  currency?: string;
}

interface EbayLineItem {
  lineItemId?: string;
  legacyItemId?: string;
  sku?: string;
  quantity?: number;
  lineItemCost?: EbayAmount;
  deliveryCost?: { shippingCost?: EbayAmount };
  ebayCollectAndRemitTaxes?: { amount?: EbayAmount }[];
}

interface EbayOrder {
  orderId?: string;
  creationDate?: string;
  lineItems?: EbayLineItem[];
}

interface OrderPage {
  orders?: EbayOrder[];
  total?: number;
  next?: string;
}

interface FinanceTransaction {
  orderId?: string;
  orderLineItems?: {
    lineItemId?: string;
    marketplaceFees?: { amount?: EbayAmount }[];
  }[];
  totalFeeAmount?: EbayAmount;
}

interface TransactionPage {
  transactions?: FinanceTransaction[];
  next?: string;
}

function money(amount: EbayAmount | undefined): number {
  const n = Number(amount?.value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// eBay rejects a window whose end is at or after its own idea of now, and our clock is
// not its clock. Ending a minute back costs nothing — an order created in the last sixty
// seconds arrives on the next sync — and stops the call failing on skew alone.
const CLOCK_SKEW_MARGIN_MS = 60_000;

/** eBay's date filters want `[start..end]` with no milliseconds. */
function filterRange(since: Date, until: Date): string {
  const fmt = (d: Date) => `${d.toISOString().slice(0, 19)}.000Z`;
  const safeEnd = new Date(Math.min(until.getTime(), Date.now() - CLOCK_SKEW_MARGIN_MS));
  return `[${fmt(since)}..${fmt(safeEnd)}]`;
}

async function fetchOrders(since: Date, until: Date): Promise<EbayOrder[]> {
  const orders: EbayOrder[] = [];
  let offset = 0;
  for (;;) {
    const filter = encodeURIComponent(`creationdate:${filterRange(since, until)}`);
    const page = await ebayGet<OrderPage>(
      `/sell/fulfillment/v1/order?filter=${filter}&limit=${PAGE_SIZE}&offset=${offset}`
    );
    const batch = page.orders ?? [];
    orders.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    // eBay caps order paging; stop rather than loop forever on a huge window.
    if (offset >= 10_000) break;
  }
  return orders;
}

/** Fees per line item. Returns an empty map (not an error) when finances is unavailable. */
async function fetchFees(since: Date, until: Date): Promise<Map<string, number>> {
  const fees = new Map<string, number>();
  try {
    let offset = 0;
    for (;;) {
      const filter = encodeURIComponent(
        `transactionDate:${filterRange(since, until)},transactionType:{SALE}`
      );
      const page = await ebayGet<TransactionPage>(
        `/sell/finances/v1/transaction?filter=${filter}&limit=${PAGE_SIZE}&offset=${offset}`
      );
      const batch = page.transactions ?? [];
      for (const t of batch) {
        for (const li of t.orderLineItems ?? []) {
          if (!li.lineItemId) continue;
          const total = (li.marketplaceFees ?? []).reduce((sum, f) => sum + money(f.amount), 0);
          fees.set(li.lineItemId, round2(fees.get(li.lineItemId) ?? 0) + round2(total));
        }
      }
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      if (offset >= 10_000) break;
    }
  } catch (err) {
    console.warn(
      '[ebay] Could not read finance records, falling back to estimated fees:',
      err instanceof Error ? err.message : err
    );
  }
  return fees;
}

export async function fetchSales(since: Date, until: Date = new Date()): Promise<Sale[]> {
  const [orders, fees] = await Promise.all([fetchOrders(since, until), fetchFees(since, until)]);
  const syncedAt = new Date().toISOString();
  const sales: Sale[] = [];

  for (const order of orders) {
    for (const li of order.lineItems ?? []) {
      if (!li.lineItemId) continue;
      const gross = money(li.lineItemCost);
      const shipping = money(li.deliveryCost?.shippingCost);
      const tax = (li.ebayCollectAndRemitTaxes ?? []).reduce((sum, t) => sum + money(t.amount), 0);

      const known = fees.get(li.lineItemId);
      const feesEstimated = known === undefined;
      const fee = known ?? (gross + shipping) * ESTIMATED_FEE_RATE;

      sales.push({
        lineItemId: li.lineItemId,
        orderId: order.orderId ?? '',
        soldAt: order.creationDate ?? syncedAt,
        ebayListingId: li.legacyItemId ?? '',
        sku: li.sku ?? '',
        qtySold: li.quantity ?? 0,
        grossSale: round2(gross),
        shipping: round2(shipping),
        // Collected from the buyer and remitted by eBay — it never reaches the seller, so
        // it is recorded for reconciliation but excluded from proceeds.
        tax: round2(tax),
        fees: round2(fee),
        netProceeds: round2(gross + shipping - fee),
        currency: li.lineItemCost?.currency ?? 'USD',
        feesEstimated,
        syncedAt,
      });
    }
  }

  return sales;
}

export function isEbayConfigured(): boolean {
  return !!(env.ebayClientId && env.ebayClientSecret && env.ebayRefreshToken);
}
