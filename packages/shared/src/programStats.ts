import { type DiscrepancyLogEntry } from './discrepancy.js';
import { type PartGroup } from './grouping.js';
import { getCheckpoints } from './status.js';
import { chicagoDateString, mondayOf } from './submissions.js';

export type StatPeriod = 'day' | 'week' | 'month' | 'all';

export interface ProgramTotals {
  added: number;
  photographed: number;
  listed: number;
  completed: number;
  /** Expected value of the parts listed — unit price times quantity, in dollars. */
  recoveryValue: number;
}

export interface DiscrepancyTotals {
  /** Distinct SKUs whose count didn't reconcile. */
  skus: number;
  /** Signed sum of the variances — negative means stock is missing overall. */
  netUnits: number;
}

type DatedPeriod = Exclude<StatPeriod, 'all'>;

function bucketFromDay(day: string, period: DatedPeriod): string {
  if (period === 'day') return day;
  if (period === 'week') return mondayOf(day);
  return day.slice(0, 7);
}

/** A real moment in time, such as a photo upload — read it in the site's timezone. */
function instantDay(iso: string): string {
  return chicagoDateString(iso);
}

/**
 * A calendar date the user picked, stored as UTC midnight. Its date must be read straight
 * off the string: running it through a timezone would move it to the previous day, so a
 * part listed on the 20th would be counted on the 19th.
 */
function calendarDay(iso: string): string {
  return iso.slice(0, 10);
}

function isInPeriod(
  iso: string | null | undefined,
  period: DatedPeriod,
  now: Date,
  toDay: (iso: string) => string
): boolean {
  if (!iso) return false;
  if (Number.isNaN(new Date(iso).getTime())) return false;
  return bucketFromDay(toDay(iso), period) === bucketFromDay(instantDay(now.toISOString()), period);
}

/**
 * What a SKU's stock is expected to fetch.
 *
 * `activeRecoveryPriceBasis` is a price *per unit*, so it has to be multiplied by the
 * quantity on hand — summing the bare basis values counts a bin of twenty the same as a
 * bin of one. Rows of a SKU repeat the same basis, so the maximum picks the populated one
 * where some rows predate the column.
 */
export function extendedValue(group: PartGroup): number {
  const basis = Math.max(0, ...group.records.map((r) => r.activeRecoveryPriceBasis ?? 0));
  return basis * group.qoh;
}

/** Expected value of every part, listed or not — the denominator for recovery value. */
export function catalogueValue(groups: PartGroup[]): number {
  return groups.reduce((sum, g) => sum + extendedValue(g), 0);
}

/** When this SKU was first photographed — a later top-up photo isn't a new part done. */
function firstPhotographedAt(group: PartGroup): string | undefined {
  const stamps = group.photos.map((p) => p.uploadedAt).filter(Boolean).sort();
  return stamps[0];
}

/**
 * Listing is the last of the five checkpoints in practice, so its date stands in for when
 * a part was finished. Unlike `updatedAt` it doesn't drift when the row is edited later.
 */
function listedAt(group: PartGroup): string | undefined {
  return group.records.map((r) => r.itemListedDate).filter((d): d is string => !!d).sort()[0];
}

/**
 * Programme-wide progress, counted per SKU so the numbers line up with the board.
 *
 * 'all' reports current state and is the authoritative figure. The dated periods count
 * events by when they happened, using the only timestamps that exist: photo upload time,
 * listing date, and row creation time. Rows imported before `createdAt` existed carry no
 * creation date, so they contribute to 'all' but never to a dated period.
 */
export function computeProgramTotals(
  groups: PartGroup[],
  period: StatPeriod = 'all',
  now: Date = new Date()
): ProgramTotals {
  if (period === 'all') {
    let photographed = 0;
    let listed = 0;
    let completed = 0;
    let recoveryValue = 0;
    for (const g of groups) {
      const checkpoints = getCheckpoints(g);
      if (checkpoints.photographed) photographed++;
      if (checkpoints.listed) {
        listed++;
        recoveryValue += extendedValue(g);
      }
      if (g.workflowStatus === 'Completed') completed++;
    }
    return { added: groups.length, photographed, listed, completed, recoveryValue };
  }

  let added = 0;
  let photographed = 0;
  let listed = 0;
  let completed = 0;
  let recoveryValue = 0;

  for (const g of groups) {
    if (g.records.some((r) => isInPeriod(r.createdAt, period, now, instantDay))) added++;
    if (isInPeriod(firstPhotographedAt(g), period, now, instantDay)) photographed++;
    if (isInPeriod(listedAt(g), period, now, calendarDay)) {
      listed++;
      recoveryValue += extendedValue(g);
      if (g.workflowStatus === 'Completed') completed++;
    }
  }

  return { added, photographed, listed, completed, recoveryValue };
}

/**
 * Counting variances, from the audit log rather than the live parts: the log is stamped
 * with when each count happened, which is what makes a period view possible, and it keeps
 * the expected quantity as it stood at the time even after a later import moves it.
 */
export function computeDiscrepancyTotals(
  log: DiscrepancyLogEntry[],
  period: StatPeriod = 'all',
  now: Date = new Date()
): DiscrepancyTotals {
  const inWindow =
    period === 'all' ? log : log.filter((e) => isInPeriod(e.recordedAt, period, now, instantDay));
  // One SKU counted twice is still one SKU with a problem; the latest entry wins.
  const latestBySku = new Map<string, DiscrepancyLogEntry>();
  for (const e of inWindow) {
    const prev = latestBySku.get(e.sku);
    if (!prev || e.recordedAt > prev.recordedAt) latestBySku.set(e.sku, e);
  }
  let netUnits = 0;
  for (const e of latestBySku.values()) netUnits += e.variance;
  return { skus: latestBySku.size, netUnits };
}

export function percentOf(value: number, total: number): string {
  if (total === 0) return '0%';
  const pct = (value / total) * 100;
  // Sub-1% work still deserves a number rather than a flat 0%.
  return pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`;
}
