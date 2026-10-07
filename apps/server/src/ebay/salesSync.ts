import { getAllParts, replaceListings, updatePart, upsertSales } from '../google/sheetsService.js';
import { fetchListings } from './listingsService.js';
import { fetchSales } from './ordersService.js';
import { sendDailyReminders } from './reminders.js';
import { notifyNewSales } from './saleNotify.js';

/**
 * Bringing SPARE up to date with eBay: sales with their real fees and payouts, and the
 * live listings with their traffic.
 *
 * One run at a time, shared by the Sync button, the hourly timer and the check made when
 * someone opens the app — so two people opening SPARE together, or a press of the button
 * just as the timer fires, cost eBay one sync rather than several.
 */

export interface SyncResult {
  added: number;
  updated: number;
  unchanged: number;
  fetched: number;
  estimatedFees: number;
  listings: number;
  linked: number;
  /** Orders announced by email because this sync found a sale in them. */
  notified: number;
  /** What went into the reminders this sync sent, when it was the one to send them. */
  reminded: { ship: number; partSale: number };
  listingsError?: string;
  since: string;
}

export const DEFAULT_LOOKBACK_DAYS = 30;
/** eBay's order search won't accept an unbounded window. */
export const MAX_LOOKBACK_DAYS = 365;
/**
 * Older than this and opening the app brings it up to date. Short, so every sign-in
 * syncs; long enough that someone reloading, or a few people arriving together, costs
 * eBay a single sync.
 */
export const STALE_AFTER_MS = 2 * 60_000;
/** How often a running server syncs with nobody asking. */
export const AUTO_SYNC_EVERY_MS = 60 * 60_000;

let lastSyncedAt: number | null = null;
let running: Promise<SyncResult> | null = null;

export function lastSync(): string | null {
  return lastSyncedAt ? new Date(lastSyncedAt).toISOString() : null;
}

export function isStale(now = Date.now()): boolean {
  return lastSyncedAt == null || now - lastSyncedAt > STALE_AFTER_MS;
}

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

async function syncOnce(days: number): Promise<SyncResult> {
  const since = new Date(Date.now() - days * 86_400_000);
  const sales = await fetchSales(since);
  const { addedLineItemIds, ...result } = await upsertSales(sales);

  // Listings ride along. A failure here must not lose the sales that were just written,
  // so it is reported rather than thrown.
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

  // Announced after they're saved, so a failure here costs an email, never a sale.
  let notified = 0;
  try {
    notified = await notifyNewSales(addedLineItemIds);
  } catch (err) {
    console.warn('[notify] Sale notification failed:', err instanceof Error ? err.message : err);
  }
  // After the sales and listings are current, so the reminders read the latest of both.
  let reminded = { ship: 0, partSale: 0 };
  try {
    reminded = await sendDailyReminders();
  } catch (err) {
    console.warn('[notify] Daily reminders failed:', err instanceof Error ? err.message : err);
  }

  lastSyncedAt = Date.now();
  return {
    ...result,
    fetched: sales.length,
    estimatedFees: sales.filter((s) => s.feesEstimated).length,
    listings,
    linked,
    notified,
    reminded,
    listingsError,
    since: since.toISOString(),
  };
}

/** Syncs now, or joins the sync already running. */
export function syncSales(days = DEFAULT_LOOKBACK_DAYS): Promise<SyncResult> {
  if (running) return running;
  const window = Math.min(MAX_LOOKBACK_DAYS, Math.max(1, Number.isFinite(days) ? days : DEFAULT_LOOKBACK_DAYS));
  running = syncOnce(window).finally(() => {
    running = null;
  });
  return running;
}

/**
 * Syncs every hour for as long as the server runs, starting a minute after it starts. On
 * a host that sleeps when idle that is only while it's awake — opening the app covers the
 * gaps, since a stale sync is brought up to date then.
 */
export function startAutoSync(enabled: () => boolean): void {
  const tick = () => {
    if (!enabled()) return;
    syncSales().catch((err) => console.warn('[ebay] Scheduled sync failed:', err instanceof Error ? err.message : err));
  };
  setTimeout(tick, 60_000).unref();
  setInterval(tick, AUTO_SYNC_EVERY_MS).unref();
}

/** Test seam: forget when the last sync ran. */
export function resetSyncState(): void {
  lastSyncedAt = null;
  running = null;
}
