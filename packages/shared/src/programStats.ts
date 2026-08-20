import { type PartGroup } from './grouping.js';
import { getCheckpoints } from './status.js';
import { chicagoDateString, mondayOf } from './submissions.js';

export type StatPeriod = 'day' | 'week' | 'month' | 'all';

export interface ProgramTotals {
  added: number;
  photographed: number;
  listed: number;
  completed: number;
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
    for (const g of groups) {
      const checkpoints = getCheckpoints(g);
      if (checkpoints.photographed) photographed++;
      if (checkpoints.listed) listed++;
      if (g.workflowStatus === 'Completed') completed++;
    }
    return { added: groups.length, photographed, listed, completed };
  }

  let added = 0;
  let photographed = 0;
  let listed = 0;
  let completed = 0;

  for (const g of groups) {
    if (g.records.some((r) => isInPeriod(r.createdAt, period, now, instantDay))) added++;
    if (isInPeriod(firstPhotographedAt(g), period, now, instantDay)) photographed++;
    if (isInPeriod(listedAt(g), period, now, calendarDay)) {
      listed++;
      if (g.workflowStatus === 'Completed') completed++;
    }
  }

  return { added, photographed, listed, completed };
}

export function percentOf(value: number, total: number): string {
  if (total === 0) return '0%';
  const pct = (value / total) * 100;
  // Sub-1% work still deserves a number rather than a flat 0%.
  return pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`;
}
