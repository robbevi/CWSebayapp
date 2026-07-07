import { useMemo } from 'react';
import type { InventoryPart, WorkflowStatus } from '@warehouse/shared';
import { useInventoryParts } from '../hooks/useInventoryParts';
import { useUIStore } from '../state/useUIStore';
import { BucketColumn } from './BucketColumn';

function matchesSearch(p: InventoryPart, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [p.sku, p.description, p.manufacturer, p.inventorySite, p.binLocation, p.notes]
    .filter((v): v is string => !!v)
    .some((v) => v.toLowerCase().includes(needle));
}

const SORT_FIELD: Record<string, keyof InventoryPart> = {
  Bin: 'binLocation',
  SKU: 'sku',
  Manufacturer: 'manufacturer',
  Site: 'inventorySite',
};

function sortParts(parts: InventoryPart[], sort: string): InventoryPart[] {
  const field = SORT_FIELD[sort] ?? 'binLocation';
  return [...parts].sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')));
}

export function KanbanBoard() {
  const { data, isLoading } = useInventoryParts();
  const { search, site, bin, mfr, sort } = useUIStore();

  const filtered = useMemo(() => {
    const parts = data ?? [];
    const result = parts.filter(
      (p) =>
        (site === 'All' || p.inventorySite === site) &&
        (bin === 'All' || p.binLocation === bin) &&
        (mfr === 'All' || p.manufacturer === mfr) &&
        matchesSearch(p, search)
    );
    return sortParts(result, sort);
  }, [data, search, site, bin, mfr, sort]);

  if (isLoading) {
    return <div className="py-16 text-center text-textMuted">Loading inventory…</div>;
  }

  const buckets: Record<WorkflowStatus, InventoryPart[]> = {
    NotStarted: filtered.filter((p) => p.workflowStatus === 'NotStarted'),
    Processing: filtered.filter((p) => p.workflowStatus === 'Processing'),
    Completed: filtered.filter((p) => p.workflowStatus === 'Completed'),
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <BucketColumn status="NotStarted" parts={buckets.NotStarted} />
      <BucketColumn status="Processing" parts={buckets.Processing} />
      <BucketColumn status="Completed" parts={buckets.Completed} />
    </div>
  );
}
