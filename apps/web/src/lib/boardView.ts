import {
  ageBandOf,
  checkpointCount,
  draftReadiness,
  getCheckpoints,
  getGroupDiscrepancy,
  listingFor,
  cetarisNeeded,
  cetarisPending,
  saleComplete,
  salesForGroup,
  type AgeBandKey,
  type InventoryPart,
  type Listing,
  type PartGroup,
  type SalesIndex,
  type TaskKey,
  type WorkflowStatus,
} from '@warehouse/shared';
import { isResearched } from '../hooks/useResearchedSkus';
import type {
  DiscrepancyFilter,
  EbayView,
  MarginFilter,
  ResearchFilter,
  SaleFilter,
  SortKey,
} from '../state/useUIStore';

/**
 * What the board shows and in what order: its filters, search and sort, applied to the
 * SKU groups. Kept apart from the board so the export reads exactly the same view.
 */

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
  const sales = salesForGroup(g, salesIndex);
  const states: SaleFilter[] = [sales.length > 0 ? 'sold' : 'unsold'];
  // A Part Sale still to start, or started and still Pending in Cetaris; complete once every
  // sale's Part Sale is completed and eBay has paid each of them out.
  if (sales.some(cetarisNeeded)) states.push('awaitingCetaris');
  if (sales.some(cetarisPending)) states.push('cetarisPending');
  if (sales.length > 0 && sales.every(saleComplete)) states.push('complete');
  return filters.some((f) => states.includes(f));
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
export function sortParts(
  parts: PartGroup[],
  sort: SortKey,
  then: SortKey | null,
  listingsIndex: Map<string, Listing>
): PartGroup[] {
  const primary = comparatorFor(sort, listingsIndex);
  const secondary = then && then !== sort ? comparatorFor(then, listingsIndex) : null;
  return [...parts].sort((a, b) => primary(a, b) || (secondary ? secondary(a, b) : 0));
}

export const ALL_STATUSES: WorkflowStatus[] = ['NotStarted', 'Processing', 'Listed'];

/** The board's filters and sort, as the UI store holds them. */
export interface BoardFilters {
  search: string;
  sites: string[];
  bins: string[];
  recoveryBins: string[];
  manufacturers: string[];
  statuses: WorkflowStatus[];
  completedTasks: TaskKey[];
  margins: MarginFilter[];
  discrepancies: DiscrepancyFilter[];
  research: ResearchFilter[];
  sales: SaleFilter[];
  progress: number[];
  ages: AgeBandKey[];
  needsReview: boolean;
  sort: SortKey;
  sortThen: SortKey | null;
  ebayView: EbayView;
}

/** What the filters are judged against, beyond the parts themselves. */
export interface BoardData {
  groups: PartGroup[];
  researched: Set<string>;
  salesIndex: SalesIndex;
  listingsIndex: Map<string, Listing>;
}

/** Every SKU group the filters let through, in the board's sort order. */
export function filterBoard(d: BoardData, f: BoardFilters): PartGroup[] {
  const result = d.groups.filter(
    (g) =>
      matchesSet(g.records.map((r) => r.inventorySite), f.sites) &&
      matchesSet(g.records.map((r) => r.binLocation), f.bins) &&
      matchesSet(g.records.map((r) => r.newBinLocation), f.recoveryBins) &&
      matchesSet(g.records.map((r) => r.manufacturer), f.manufacturers) &&
      matchesCompletedTasks(g, f.completedTasks) &&
      matchesResearch(g, f.research, d.researched) &&
      matchesSales(g, f.sales, d.salesIndex) &&
      (f.progress.length === 0 || f.progress.includes(checkpointCount(g))) &&
      (f.ages.length === 0 || f.ages.includes(ageBandOf(g) as AgeBandKey)) &&
      (f.margins.length === 0 || f.margins.includes(g.grossMarginStatus as MarginFilter)) &&
      (f.discrepancies.length === 0 || f.discrepancies.includes(getGroupDiscrepancy(g)?.kind as DiscrepancyFilter)) &&
      (!f.needsReview || g.needsReview) &&
      matchesSearch(g, f.search)
  );
  return sortParts(result, f.sort, f.sortThen, d.listingsIndex);
}

/** The columns on show: all three, or the ones the status filter picks. */
export function visibleStatuses(f: Pick<BoardFilters, 'statuses'>): WorkflowStatus[] {
  return f.statuses.length === 0 ? ALL_STATUSES : ALL_STATUSES.filter((s) => f.statuses.includes(s));
}

/** The Listed / Sold column read two ways: what has sold, and what is still for sale. */
export function splitListed(parts: PartGroup[], salesIndex: SalesIndex): { sold: PartGroup[]; listed: PartGroup[] } {
  const sold: PartGroup[] = [];
  const listed: PartGroup[] = [];
  for (const p of parts) (salesForGroup(p, salesIndex).length > 0 ? sold : listed).push(p);
  return { sold, listed };
}

/** A column's cards as shown, after the Listed / Sold column's own All / Listed / Sold choice. */
export function columnParts(status: WorkflowStatus, parts: PartGroup[], view: EbayView, salesIndex: SalesIndex): PartGroup[] {
  if (status !== 'Listed' || view === 'all') return parts;
  const split = splitListed(parts, salesIndex);
  return view === 'sold' ? split.sold : split.listed;
}

/**
 * The rows behind what the board shows, for the export: column by column in board order,
 * cards in the board's sort, and each card's records under it. Where a site, bin, recovery
 * bin or manufacturer filter is set, only the records that match it come along — the board
 * shows a SKU stored partly in the chosen bin, and the export says which part of it.
 */
export function boardRecords(d: BoardData, f: BoardFilters): InventoryPart[] {
  const shown = filterBoard(d, f);
  const keep = (r: InventoryPart) =>
    matchesSet([r.inventorySite], f.sites) &&
    matchesSet([r.binLocation], f.bins) &&
    matchesSet([r.newBinLocation], f.recoveryBins) &&
    matchesSet([r.manufacturer], f.manufacturers);
  return visibleStatuses(f).flatMap((status) =>
    columnParts(
      status,
      shown.filter((g) => g.workflowStatus === status),
      f.ebayView,
      d.salesIndex
    ).flatMap((g) => g.records.filter(keep))
  );
}

/** Whether anything narrows the board, so the export can be named for what it holds. */
export function isFiltered(f: BoardFilters): boolean {
  return (
    !!f.search ||
    f.needsReview ||
    f.ebayView !== 'all' ||
    [
      f.sites,
      f.bins,
      f.recoveryBins,
      f.manufacturers,
      f.statuses,
      f.completedTasks,
      f.margins,
      f.discrepancies,
      f.research,
      f.sales,
      f.progress,
      f.ages,
    ].some((list) => list.length > 0)
  );
}
