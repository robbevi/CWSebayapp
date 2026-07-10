import { useMemo } from 'react';
import type { InventoryPart, WorkflowStatus } from '@warehouse/shared';
import { useInventoryParts } from '../hooks/useInventoryParts';
import { useUIStore, type SortKey } from '../state/useUIStore';
import { BucketColumn } from './BucketColumn';

function matchesSearch(p: InventoryPart, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [p.sku, p.description, p.manufacturer, p.inventorySite, p.binLocation, p.notes]
    .filter((v): v is string => !!v)
    .some((v) => v.toLowerCase().includes(needle));
}

function matchesSet(value: string, selected: string[]): boolean {
  return selected.length === 0 || selected.includes(value);
}

const SORT_FIELD: Record<SortKey, keyof InventoryPart> = {
  SKU: 'sku',
  'Bin Location': 'binLocation',
  Manufacturer: 'manufacturer',
  'Inventory Site': 'inventorySite',
  'Quantity On Hand': 'qoh',
};

function sortParts(parts: InventoryPart[], sort: SortKey): InventoryPart[] {
  const field = SORT_FIELD[sort];
  if (sort === 'Quantity On Hand') {
    return [...parts].sort((a, b) => a.qoh - b.qoh);
  }
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
  const { search, sites, bins, manufacturers, statuses, sort } = useUIStore();

  const filtered = useMemo(() => {
    const parts = data ?? [];
    const result = parts.filter(
      (p) =>
        matchesSet(p.inventorySite, sites) &&
        matchesSet(p.binLocation, bins) &&
        matchesSet(p.manufacturer, manufacturers) &&
        matchesSearch(p, search)
    );
    return sortParts(result, sort);
  }, [data, search, sites, bins, manufacturers, sort]);

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
