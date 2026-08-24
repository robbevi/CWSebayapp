import type { PartGroup } from './grouping.js';
import { computeStandingValue, extendedValue } from './programStats.js';
import type { Sale } from './sales.js';
import { getCheckpoints } from './status.js';
import { chicagoDateString, mondayOf } from './submissions.js';

/**
 * The at-a-glance figures above the board. Deliberately a different set from the
 * Scoreboard's: this is the state of the pile right now, not a record of activity, so
 * everything here is current except the listing rate — which is the one number that only
 * means something as a trend.
 */
export interface DashboardStats {
  totalItems: number;
  /** Underlying stock rows behind those items, which is larger where a SKU has several bins. */
  totalRecords: number;
  totalQoh: number;
  countedParts: number;
  estRecoveryValue: number;
  listedValue: number;
  listedThisWeek: number;
  listedLastWeek: number;
  /** Null when last week had no listings — a percentage against zero says nothing. */
  listedDeltaPct: number | null;
  needsReview: number;
}

/** The Monday of the week a part was first listed, or undefined if it never was. */
function listedWeek(group: PartGroup): string | undefined {
  const dates = group.records
    .map((r) => r.itemListedDate)
    .filter((d): d is string => !!d)
    .sort();
  // Listing dates are stored at UTC midnight, so the calendar date is read straight off
  // the string; converting through a timezone would shift it to the previous day.
  return dates.length > 0 ? mondayOf(dates[0].slice(0, 10)) : undefined;
}

function weekOf(date: Date, weeksAgo = 0): string {
  const monday = mondayOf(chicagoDateString(date.toISOString()));
  if (weeksAgo === 0) return monday;
  const d = new Date(`${monday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - weeksAgo * 7);
  return d.toISOString().slice(0, 10);
}

export function computeDashboardStats(
  groups: PartGroup[],
  sales: Sale[],
  now: Date = new Date()
): DashboardStats {
  const thisWeek = weekOf(now);
  const lastWeek = weekOf(now, 1);

  let totalRecords = 0;
  let totalQoh = 0;
  let countedParts = 0;
  let listedValue = 0;
  let listedThisWeek = 0;
  let listedLastWeek = 0;
  let needsReview = 0;

  for (const g of groups) {
    totalRecords += g.records.length;
    totalQoh += g.qoh;
    if (getCheckpoints(g).qtyConfirmed) countedParts++;
    if (g.needsReview) needsReview++;

    const week = listedWeek(g);
    if (week === thisWeek) listedThisWeek++;
    else if (week === lastWeek) listedLastWeek++;
  }

  const { potential } = computeStandingValue(groups, sales);
  for (const g of groups) {
    if (getCheckpoints(g).listed) listedValue += extendedValue(g);
  }

  return {
    totalItems: groups.length,
    totalRecords,
    totalQoh,
    countedParts,
    estRecoveryValue: potential,
    listedValue,
    listedThisWeek,
    listedLastWeek,
    listedDeltaPct:
      listedLastWeek === 0 ? null : Math.round(((listedThisWeek - listedLastWeek) / listedLastWeek) * 100),
    needsReview,
  };
}

/** Whole days a part has been on eBay. Null when it was never listed. */
export function daysListed(itemListedDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!itemListedDate) return null;
  const listed = new Date(`${itemListedDate.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(listed)) return null;
  const today = new Date(`${chicagoDateString(now.toISOString())}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((today - listed) / 86_400_000));
}
