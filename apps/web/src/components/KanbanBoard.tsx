import { useMemo } from 'react';
import {
  checkpointCount,
  getCheckpoints,
  getDiscrepancy,
  type InventoryPart,
  type TaskKey,
  type WorkflowStatus,
} from '@warehouse/shared';
import { useInventoryParts } from '../hooks/useInventoryParts';
import { useUIStore, type SortKey } from '../state/useUIStore';
import { BucketColumn } from './BucketColumn';

function matchesSearch(p: InventoryPart, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [p.sku, p.description, p.manufacturer, p.inventorySite, p.binLocation, p.newBinLocation, p.notes]
    .filter((v): v is string => !!v)
    .some((v) => v.toLowerCase().includes(needle));
}

function matchesSet(value: string, selected: string[]): boolean {
  return selected.length === 0 || selected.includes(value);
}

// A part matches if it's still missing at least one of the checked tasks — mirrors the
// Status filter's OR-across-checked-boxes pattern, so checking several boxes broadens
// the results (anything left to do on any of them) rather than narrowing to parts
// missing ALL of them at once.
function matchesMissingTasks(p: InventoryPart, missingTasks: TaskKey[]): boolean {
  if (missingTasks.length === 0) return true;
  const checkpoints = getCheckpoints(p);
  return missingTasks.some((key) => !checkpoints[key]);
}

const SORT_FIELD: Partial<Record<SortKey, keyof InventoryPart>> = {
  SKU: 'sku',
  'Bin Location': 'binLocation',
  Manufacturer: 'manufacturer',
  'Inventory Site': 'inventorySite',
};

// Sorts where "best first" means descending (bigger money is more interesting), versus
// rank-style fields where 1 is best and ascending is correct.
const DESCENDING_NUMERIC: Partial<Record<SortKey, keyof InventoryPart>> = {
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

function sortParts(parts: InventoryPart[], sort: SortKey): InventoryPart[] {
  if (sort === 'Quantity On Hand') {
    return [...parts].sort((a, b) => a.qoh - b.qoh);
  }
  if (sort === 'Progress') {
    return [...parts].sort((a, b) => checkpointCount(a) - checkpointCount(b));
  }
  if (sort === 'Qty Discrepancy') {
    // Worst shortfall first; uncounted and reconciled parts fall to the bottom.
    const rank = (p: InventoryPart) => {
      const d = getDiscrepancy(p);
      return d && d.kind !== 'none' ? d.variance : Number.POSITIVE_INFINITY;
    };
    return [...parts].sort((a, b) => rank(a) - rank(b));
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

const ALL_STATUSES: WorkflowStatus[] = ['NotStarted', 'Processing', 'Completed'];

// Tailwind needs static class names, so a computed `lg:grid-cols-${n}` string won't
// generate — this maps the visible column count to a real class.
const GRID_COLS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
};

export function KanbanBoard() {
  const { data, isLoading } = useInventoryParts();
  const { search, sites, bins, recoveryBins, manufacturers, statuses, missingTasks, margins, discrepancies, sort } =
    useUIStore();

  const filtered = useMemo(() => {
    const parts = data ?? [];
    const result = parts.filter(
      (p) =>
        matchesSet(p.inventorySite, sites) &&
        matchesSet(p.binLocation, bins) &&
        matchesSet(p.newBinLocation ?? '', recoveryBins) &&
        matchesSet(p.manufacturer, manufacturers) &&
        matchesMissingTasks(p, missingTasks) &&
        (margins.length === 0 || margins.includes(p.grossMarginStatus as (typeof margins)[number])) &&
        (discrepancies.length === 0 ||
          discrepancies.includes(getDiscrepancy(p)?.kind as (typeof discrepancies)[number])) &&
        matchesSearch(p, search)
    );
    return sortParts(result, sort);
  }, [data, search, sites, bins, recoveryBins, manufacturers, missingTasks, margins, discrepancies, sort]);

  if (isLoading) {
    return <div className="py-16 text-center text-textMuted">Loading inventory…</div>;
  }

  const buckets: Record<WorkflowStatus, InventoryPart[]> = {
    NotStarted: filtered.filter((p) => p.workflowStatus === 'NotStarted'),
    Processing: filtered.filter((p) => p.workflowStatus === 'Processing'),
    Completed: filtered.filter((p) => p.workflowStatus === 'Completed'),
  };

  const visibleStatuses = statuses.length === 0 ? ALL_STATUSES : ALL_STATUSES.filter((s) => statuses.includes(s));

  return (
    <div className={`grid grid-cols-1 gap-4 lg:h-full ${GRID_COLS[visibleStatuses.length]}`}>
      {visibleStatuses.map((status) => (
        <BucketColumn key={status} status={status} parts={buckets[status]} />
      ))}
    </div>
  );
}
