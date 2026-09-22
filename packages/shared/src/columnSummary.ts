import type { PartGroup } from './grouping.js';
import type { Listing } from './listings.js';
import { listingFor } from './listings.js';
import { extendedValue } from './programStats.js';
import { salesForGroup, type SalesIndex } from './sales.js';
import { checkpointCount, getCheckpoints, TASK_KEYS, type TaskKey } from './status.js';
import type { WorkflowStatus } from './types.js';

/**
 * What a whole column amounts to: how much of it is worth, how far along it is, and what
 * has been sitting there longest.
 *
 * The board answers "what should I pick up next"; this answers "where does this pile
 * stand" — the question asked in a planning meeting rather than on the warehouse floor.
 * Everything is computed from the groups handed in, so it describes whatever the filters
 * have left on screen.
 */

export interface ProgressBand {
  /** Checkpoints finished, 0 to 5. */
  done: number;
  parts: number;
  value: number;
}

export interface AgeBand {
  label: string;
  parts: number;
  value: number;
}

export interface SiteBreakdown {
  site: string;
  parts: number;
  value: number;
}

export interface ColumnSummary {
  status: WorkflowStatus;
  parts: number;
  /** Stock rows behind those parts: a SKU in three bins is three. */
  records: number;
  qoh: number;
  value: number;
  /** Parts with no recovery basis, so `value` understates the pile by this many. */
  unpriced: number;
  progress: ProgressBand[];
  /** How many parts have each checkpoint done. */
  tasks: { key: TaskKey; label: string; parts: number }[];
  ageBands: AgeBand[];
  /** Days since the oldest part here last changed, and the median across the column. */
  oldestDays: number | null;
  medianDays: number | null;
  needsReview: number;
  discrepancies: number;
  sites: SiteBreakdown[];
  /** Listing figures, for the eBay column. Null elsewhere. */
  listings: {
    live: number;
    soldOut: number;
    partSold: number;
    askingValue: number;
    soldValue: number;
    views: number;
    impressions: number;
    watchers: number;
    /** Live listings with no view in the reporting window — nobody is finding them. */
    noViews: number;
  } | null;
}

const TASK_LABELS: Record<TaskKey, string> = {
  photographed: 'Photographed',
  qtyConfirmed: 'Quantity confirmed',
  conditionSet: 'Condition set',
  transferred: 'Transferred',
  listed: 'Listed on eBay',
};

/** Where the column's clock starts: the last thing anyone did to the part. */
function lastTouchedMs(group: PartGroup): number | null {
  const stamps = [
    ...group.records.map((r) => r.updatedAt),
    ...group.records.map((r) => r.catalogingStartDate ?? undefined),
    ...group.photos.map((p) => p.uploadedAt),
  ]
    .filter((s): s is string => !!s)
    .map((s) => Date.parse(s))
    .filter((n) => !Number.isNaN(n));
  return stamps.length ? Math.max(...stamps) : null;
}

const DAY_MS = 86_400_000;

const BANDS: { label: string; min: number; max: number }[] = [
  { label: 'Under a week', min: 0, max: 7 },
  { label: '1–4 weeks', min: 7, max: 28 },
  { label: '1–3 months', min: 28, max: 90 },
  { label: 'Over 3 months', min: 90, max: Infinity },
];

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function columnSummary(
  status: WorkflowStatus,
  groups: PartGroup[],
  salesIndex: SalesIndex,
  listingsIndex: Map<string, Listing>,
  now: Date = new Date()
): ColumnSummary {
  const progress: ProgressBand[] = Array.from({ length: TASK_KEYS.length + 1 }, (_, done) => ({
    done,
    parts: 0,
    value: 0,
  }));
  const taskCounts = new Map<TaskKey, number>(TASK_KEYS.map((k) => [k, 0]));
  const bands: AgeBand[] = BANDS.map((b) => ({ label: b.label, parts: 0, value: 0 }));
  const siteTotals = new Map<string, SiteBreakdown>();
  const ages: number[] = [];

  let records = 0;
  let qoh = 0;
  let value = 0;
  let unpriced = 0;
  let needsReview = 0;
  let discrepancies = 0;

  const listings = {
    live: 0,
    soldOut: 0,
    partSold: 0,
    askingValue: 0,
    soldValue: 0,
    views: 0,
    impressions: 0,
    watchers: 0,
    noViews: 0,
  };

  for (const g of groups) {
    const worth = extendedValue(g);
    records += g.records.length;
    qoh += g.qoh;
    value += worth;
    if (!g.activeRecoveryPriceBasis) unpriced += 1;
    if (g.needsReview) needsReview += 1;
    if (g.confirmedQoh != null && g.confirmedQoh !== g.expectedForCounted) discrepancies += 1;

    const done = checkpointCount(g);
    progress[done].parts += 1;
    progress[done].value += worth;

    const checks = getCheckpoints(g);
    for (const key of TASK_KEYS) if (checks[key]) taskCounts.set(key, (taskCounts.get(key) ?? 0) + 1);

    const touched = lastTouchedMs(g);
    if (touched != null) {
      const days = Math.max(0, Math.floor((now.getTime() - touched) / DAY_MS));
      ages.push(days);
      const band = BANDS.findIndex((b) => days >= b.min && days < b.max);
      if (band >= 0) {
        bands[band].parts += 1;
        bands[band].value += worth;
      }
    }

    // A SKU in two sites counts once in each, because the question is what each site holds.
    for (const site of new Set(g.records.map((r) => r.inventorySite || '—'))) {
      const row = siteTotals.get(site) ?? { site, parts: 0, value: 0 };
      row.parts += 1;
      row.value += worth;
      siteTotals.set(site, row);
    }

    if (status === 'Listed') {
      const sales = salesForGroup(g, salesIndex);
      const soldQty = sales.reduce((n, s) => n + s.qtySold, 0);
      const listing = listingFor(g.records, listingsIndex);
      listings.soldValue += sales.reduce((sum, s) => sum + s.grossSale, 0);
      if (listing) {
        listings.askingValue += listing.price * listing.quantityAvailable;
        listings.views += listing.views ?? 0;
        listings.impressions += listing.impressions ?? 0;
        listings.watchers += listing.watchers;
        if (listing.quantityAvailable > 0 && !listing.views) listings.noViews += 1;
      }
      if (listing && listing.quantityAvailable === 0) listings.soldOut += 1;
      else if (soldQty > 0) listings.partSold += 1;
      else listings.live += 1;
    }
  }

  return {
    status,
    parts: groups.length,
    records,
    qoh,
    value,
    unpriced,
    progress,
    tasks: TASK_KEYS.map((key) => ({ key, label: TASK_LABELS[key], parts: taskCounts.get(key) ?? 0 })),
    ageBands: bands,
    oldestDays: ages.length ? Math.max(...ages) : null,
    medianDays: median(ages),
    needsReview,
    discrepancies,
    sites: [...siteTotals.values()].sort((a, b) => b.parts - a.parts),
    listings: status === 'Listed' ? listings : null,
  };
}
