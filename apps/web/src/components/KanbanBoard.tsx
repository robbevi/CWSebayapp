import { useMemo } from 'react';
import {
  checkpointCount,
  getCheckpoints,
  getGroupDiscrepancy,
  groupPartsBySku,
  indexListings,
  indexSales,
  listingFor,
  type Listing,
  type PartGroup,
  type TaskKey,
  type WorkflowStatus,
} from '@warehouse/shared';
import { useInventoryParts } from '../hooks/useInventoryParts';
import { useListings } from '../hooks/useListings';
import { useSales } from '../hooks/useSales';
import { useUIStore, type SortKey } from '../state/useUIStore';
import { BucketColumn } from './BucketColumn';

// Searches every row behind the SKU, so a part is still findable by a bin or site that
// belongs to one of its other locations.
function matchesSearch(g: PartGroup, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return g.records
    .flatMap((p) => [p.sku, p.description, p.manufacturer, p.inventorySite, p.binLocation, p.newBinLocation, p.notes])
    .filter((v): v is string => !!v)
    .some((v) => v.toLowerCase().includes(needle));
}

// A grouped SKU matches when any of its locations does — filtering to a bin should still
// surface a part that is only partly stored there.
function matchesSet(values: (string | undefined)[], selected: string[]): boolean {
  return selected.length === 0 || values.some((v) => selected.includes(v ?? ''));
}

// A part matches when it has finished every checked task. Checking more boxes narrows
// rather than broadens: "photographed and listed" means both are done, which is how the
// checklist reads to someone ticking boxes.
function matchesCompletedTasks(g: PartGroup, completedTasks: TaskKey[]): boolean {
  if (completedTasks.length === 0) return true;
  const checkpoints = getCheckpoints(g);
  return completedTasks.every((key) => checkpoints[key]);
}

const SORT_FIELD: Partial<Record<SortKey, keyof PartGroup>> = {
  SKU: 'sku',
  'Bin Location': 'binLocation',
  Manufacturer: 'manufacturer',
  'Inventory Site': 'inventorySite',
};

// Sorts where "best first" means descending (bigger money is more interesting), versus
// rank-style fields where 1 is best and ascending is correct.
const DESCENDING_NUMERIC: Partial<Record<SortKey, keyof PartGroup>> = {
  'Recovery Price': 'activeRecoveryPriceBasis',
  'Gross Margin': 'expectedGrossRecoveryMargin',
};

// Parts imported before these columns existed have no value. They sort to the end rather
// than the top, so an unscored backlog never buries the ranked work.
function byNumberDesc(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function byNumberAsc(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

// eBay figures live on the listing rather than the part, so they sort through the index.
// Anything without a live listing sorts last rather than as zero — no listing is not the
// same as no interest.
function sortByListing(
  parts: PartGroup[],
  listingsIndex: Map<string, Listing>,
  pick: (l: Listing) => number | null
): PartGroup[] {
  const value = (p: PartGroup) => {
    const l = listingFor(p.records, listingsIndex);
    const v = l ? pick(l) : null;
    return v ?? -1;
  };
  return [...parts].sort((a, b) => value(b) - value(a));
}

function sortParts(parts: PartGroup[], sort: SortKey, listingsIndex: Map<string, Listing>): PartGroup[] {
  if (sort === 'Watchers') return sortByListing(parts, listingsIndex, (l) => l.watchers);
  if (sort === 'Views') return sortByListing(parts, listingsIndex, (l) => l.views);
  if (sort === 'Impressions') return sortByListing(parts, listingsIndex, (l) => l.impressions);
  if (sort === 'Qty Listed') return sortByListing(parts, listingsIndex, (l) => l.quantityAvailable);
  if (sort === 'Quantity On Hand') {
    return [...parts].sort((a, b) => a.qoh - b.qoh);
  }
  if (sort === 'Progress') {
    return [...parts].sort((a, b) => checkpointCount(a) - checkpointCount(b));
  }
  if (sort === 'Recovery Bin') {
    // Parts not yet moved to the Iron Barn have no code — they sort after the ones that
    // do, so the shelved stock reads as a contiguous list.
    return [...parts].sort((a, b) =>
      (a.newBinLocation || '￿').localeCompare(b.newBinLocation || '￿')
    );
  }
  if (sort === 'Revenue Priority') {
    return [...parts].sort((a, b) => byNumberAsc(a.revenuePriorityRank, b.revenuePriorityRank));
  }
  if (sort === 'Field Review Priority') {
    // The values are prefixed with their tier ("1 - Highest Priority"), so a plain string
    // compare already orders them 1 → 4; only the empty case needs special handling.
    return [...parts].sort((a, b) =>
      (a.fieldReviewPriority || '￿').localeCompare(b.fieldReviewPriority || '￿')
    );
  }
  const descField = DESCENDING_NUMERIC[sort];
  if (descField) {
    return [...parts].sort((a, b) => byNumberDesc(a[descField] as number | null, b[descField] as number | null));
  }
  const field = SORT_FIELD[sort]!;
  return [...parts].sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')));
}

const ALL_STATUSES: WorkflowStatus[] = ['NotStarted', 'Processing', 'Listed'];

// Tailwind needs static class names, so a computed `lg:grid-cols-${n}` string won't
// generate — this maps the visible column count to a real class.
const GRID_COLS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
};

export function KanbanBoard() {
  const { data, isLoading } = useInventoryParts();
  const { data: sales } = useSales();
  const { data: listings } = useListings();
  const {
    search,
    sites,
    bins,
    recoveryBins,
    manufacturers,
    statuses,
    completedTasks,
    margins,
    discrepancies,
    needsReview,
    sort,
  } = useUIStore();

  // Every row for a SKU is folded into one card. The sheet keeps its separate rows —
  // this is purely how the board reads them.
  const groups = useMemo(() => groupPartsBySku(data ?? []), [data]);
  const salesIndex = useMemo(() => indexSales(sales ?? []), [sales]);
  const listingsIndex = useMemo(() => indexListings(listings ?? []), [listings]);

  const filtered = useMemo(() => {
    const result = groups.filter(
      (g) =>
        matchesSet(g.records.map((r) => r.inventorySite), sites) &&
        matchesSet(g.records.map((r) => r.binLocation), bins) &&
        matchesSet(g.records.map((r) => r.newBinLocation), recoveryBins) &&
        matchesSet(g.records.map((r) => r.manufacturer), manufacturers) &&
        matchesCompletedTasks(g, completedTasks) &&
        (margins.length === 0 || margins.includes(g.grossMarginStatus as (typeof margins)[number])) &&
        (discrepancies.length === 0 ||
          discrepancies.includes(getGroupDiscrepancy(g)?.kind as (typeof discrepancies)[number])) &&
        (!needsReview || g.needsReview) &&
        matchesSearch(g, search)
    );
    return sortParts(result, sort, listingsIndex);
  }, [groups, search, sites, bins, recoveryBins, manufacturers, completedTasks, margins, discrepancies, needsReview, sort, listingsIndex]);

  if (isLoading) {
    return <div className="py-16 text-center text-textMuted">Loading inventory…</div>;
  }

  const buckets: Record<WorkflowStatus, PartGroup[]> = {
    NotStarted: filtered.filter((p) => p.workflowStatus === 'NotStarted'),
    Processing: filtered.filter((p) => p.workflowStatus === 'Processing'),
    Listed: filtered.filter((p) => p.workflowStatus === 'Listed'),
  };

  const visibleStatuses = statuses.length === 0 ? ALL_STATUSES : ALL_STATUSES.filter((s) => statuses.includes(s));

  return (
    <div className={`grid grid-cols-1 gap-4 lg:h-full ${GRID_COLS[visibleStatuses.length]}`}>
      {visibleStatuses.map((status) => (
        <BucketColumn
          key={status}
          status={status}
          parts={buckets[status]}
          salesIndex={salesIndex}
          listingsIndex={listingsIndex}
        />
      ))}
    </div>
  );
}
