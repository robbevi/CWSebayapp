import { useMemo, useState } from 'react';
import {
  ageBandOf,
  checkpointCount,
  draftReadiness,
  getCheckpoints,
  getGroupDiscrepancy,
  groupPartsBySku,
  indexListings,
  indexSales,
  listingFor,
  salesForGroup,
  type AgeBandKey,
  type Listing,
  type PartGroup,
  type SalesIndex,
  type TaskKey,
  type WorkflowStatus,
} from '@warehouse/shared';
import { useInventoryParts } from '../hooks/useInventoryParts';
import { isResearched, useResearchedSkus } from '../hooks/useResearchedSkus';
import { useListings } from '../hooks/useListings';
import { useSales } from '../hooks/useSales';
import { useUIStore, type ResearchFilter, type SaleFilter, type SortKey } from '../state/useUIStore';
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
/**
 * Where the part stands with Copilot. "Ready to research" is the same bar the backlog run
 * uses — photographed, counted, graded and not yet listed — so the board and the run agree
 * on what is waiting.
 */
function researchState(g: PartGroup, researched: Set<string>): ResearchFilter {
  if (isResearched(researched, g.sku)) return 'researched';
  return draftReadiness(g).ready ? 'ready' : 'notReady';
}

function matchesResearch(g: PartGroup, filters: ResearchFilter[], researched: Set<string>): boolean {
  if (filters.length === 0) return true;
  return filters.includes(researchState(g, researched));
}

function matchesSales(g: PartGroup, filters: SaleFilter[], salesIndex: SalesIndex): boolean {
  if (filters.length === 0) return true;
  return filters.includes(salesForGroup(g, salesIndex).length > 0 ? 'sold' : 'unsold');
}

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
function byListing(
  listingsIndex: Map<string, Listing>,
  pick: (l: Listing) => number | null
): (a: PartGroup, b: PartGroup) => number {
  const value = (p: PartGroup) => {
    const l = listingFor(p.records, listingsIndex);
    const v = l ? pick(l) : null;
    return v ?? -1;
  };
  return (a, b) => value(b) - value(a);
}

/** How one sort key orders two parts. Kept separate so a second key can break its ties. */
function comparatorFor(sort: SortKey, listingsIndex: Map<string, Listing>): (a: PartGroup, b: PartGroup) => number {
  if (sort === 'Watchers') return byListing(listingsIndex, (l) => l.watchers);
  if (sort === 'Views') return byListing(listingsIndex, (l) => l.views);
  if (sort === 'Impressions') return byListing(listingsIndex, (l) => l.impressions);
  if (sort === 'Qty Listed') return byListing(listingsIndex, (l) => l.quantityAvailable);
  if (sort === 'Quantity On Hand') return (a, b) => a.qoh - b.qoh;
  if (sort === 'Progress') return (a, b) => checkpointCount(a) - checkpointCount(b);
  if (sort === 'Recovery Bin') {
    // Parts not yet moved to the Iron Barn have no code — they sort after the ones that
    // do, so the shelved stock reads as a contiguous list.
    return (a, b) => (a.newBinLocation || '￿').localeCompare(b.newBinLocation || '￿');
  }
  if (sort === 'Revenue Priority') return (a, b) => byNumberAsc(a.revenuePriorityRank, b.revenuePriorityRank);
  if (sort === 'Field Review Priority') {
    // The values are prefixed with their tier ("1 - Highest Priority"), so a plain string
    // compare already orders them 1 → 4; only the empty case needs special handling.
    return (a, b) => (a.fieldReviewPriority || '￿').localeCompare(b.fieldReviewPriority || '￿');
  }
  const descField = DESCENDING_NUMERIC[sort];
  if (descField) {
    return (a, b) => byNumberDesc(a[descField] as number | null, b[descField] as number | null);
  }
  const field = SORT_FIELD[sort]!;
  return (a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? ''));
}

/**
 * Sorts by one key, then another where the first ties — the order a picker walks shelves
 * in, or the priority within a site.
 */
function sortParts(
  parts: PartGroup[],
  sort: SortKey,
  then: SortKey | null,
  listingsIndex: Map<string, Listing>
): PartGroup[] {
  const primary = comparatorFor(sort, listingsIndex);
  const secondary = then && then !== sort ? comparatorFor(then, listingsIndex) : null;
  return [...parts].sort((a, b) => primary(a, b) || (secondary ? secondary(a, b) : 0));
}

const ALL_STATUSES: WorkflowStatus[] = ['NotStarted', 'Processing', 'Listed'];

// Tailwind needs static class names, so a computed `lg:grid-cols-${n}` string won't
// generate — this maps the visible column count to a real class.
const GRID_COLS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
};

/** Cards were drawn for a third of the board; a lone column shouldn't stretch to fill it. */
const COLUMN_WIDTH: Record<number, string> = {
  1: 'lg:max-w-md',
  2: 'lg:max-w-3xl',
  3: 'lg:max-w-none',
};

export function KanbanBoard() {
  const { data, isLoading } = useInventoryParts();
  /**
   * Which column is being worked in, below lg where the three stack. Nothing is open to
   * begin with: the choice of pile is the first decision, and three collapsed headers make
   * that choice in one screen rather than burying it under a hundred cards.
   */
  const [focused, setFocused] = useState<WorkflowStatus | null>(null);
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
    research,
    sales: saleFilters,
    progress,
    ages,
    margins,
    discrepancies,
    needsReview,
    sort,
    sortThen,
  } = useUIStore();

  // Every row for a SKU is folded into one card. The sheet keeps its separate rows —
  // this is purely how the board reads them.
  const researched = useResearchedSkus();
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
        matchesResearch(g, research, researched) &&
        matchesSales(g, saleFilters, salesIndex) &&
        (progress.length === 0 || progress.includes(checkpointCount(g))) &&
        (ages.length === 0 || ages.includes(ageBandOf(g) as AgeBandKey)) &&
        (margins.length === 0 || margins.includes(g.grossMarginStatus as (typeof margins)[number])) &&
        (discrepancies.length === 0 ||
          discrepancies.includes(getGroupDiscrepancy(g)?.kind as (typeof discrepancies)[number])) &&
        (!needsReview || g.needsReview) &&
        matchesSearch(g, search)
    );
    return sortParts(result, sort, sortThen, listingsIndex);
  }, [
    groups,
    search,
    sites,
    bins,
    recoveryBins,
    manufacturers,
    completedTasks,
    research,
    researched,
    saleFilters,
    salesIndex,
    progress,
    ages,
    margins,
    discrepancies,
    needsReview,
    sort,
    sortThen,
    listingsIndex,
  ]);

  if (isLoading) {
    return <div className="py-16 text-center text-textMuted">Loading inventory…</div>;
  }

  const buckets: Record<WorkflowStatus, PartGroup[]> = {
    NotStarted: filtered.filter((p) => p.workflowStatus === 'NotStarted'),
    Processing: filtered.filter((p) => p.workflowStatus === 'Processing'),
    Listed: filtered.filter((p) => p.workflowStatus === 'Listed'),
  };
  // The same counts before filtering, so a column can say "12 of 330" rather than leaving
  // someone to wonder whether the pile really is that small.
  const totals: Record<WorkflowStatus, number> = {
    NotStarted: groups.filter((p) => p.workflowStatus === 'NotStarted').length,
    Processing: groups.filter((p) => p.workflowStatus === 'Processing').length,
    Listed: groups.filter((p) => p.workflowStatus === 'Listed').length,
  };

  const visibleStatuses = statuses.length === 0 ? ALL_STATUSES : ALL_STATUSES.filter((s) => statuses.includes(s));

  return (
    // One or two columns keep a readable width and sit in the middle, rather than a single
    // column stretched across a desk monitor.
    <div className={`mx-auto grid w-full grid-cols-1 gap-4 lg:h-full ${GRID_COLS[visibleStatuses.length]} ${COLUMN_WIDTH[visibleStatuses.length]}`}>
      {visibleStatuses.map((status) => (
        <BucketColumn
          key={status}
          status={status}
          parts={buckets[status]}
          total={totals[status]}
          expanded={focused === status}
          onToggleExpanded={() => setFocused((f) => (f === status ? null : status))}
          // Below lg the three stack, and the one being worked in rises to the top so the
          // other two sit out of the way at the bottom rather than above the cards.
          className={focused === status ? 'order-first lg:order-none' : undefined}
          salesIndex={salesIndex}
          listingsIndex={listingsIndex}
        />
      ))}
    </div>
  );
}
