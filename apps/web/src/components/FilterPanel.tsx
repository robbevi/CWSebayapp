import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Filter, Plus, Search, X } from 'lucide-react';
import { useInventoryParts } from '../hooks/useInventoryParts';
import { useUIStore, type SortKey } from '../state/useUIStore';
import { AddPartModal } from './AddPartModal';
import { FilterDrawer, STATUS_OPTIONS } from './FilterDrawer';
import { Input } from './ui/Input';
import { SelectDropdown } from './ui/SelectDropdown';

const SORT_OPTIONS: SortKey[] = ['SKU', 'Bin Location', 'Manufacturer', 'Inventory Site', 'Quantity On Hand'];

function uniqueSorted(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort();
}

function countBy(values: (string | undefined)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) {
    if (!v) continue;
    counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}

export function FilterPanel() {
  const { data: parts } = useInventoryParts();
  const { search, sites, bins, manufacturers, statuses, sort, set, clearAll } = useUIStore();
  const [searchInput, setSearchInput] = useState(search);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addPartOpen, setAddPartOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => set({ search: searchInput }), 250);
    return () => clearTimeout(timer);
  }, [searchInput, set]);

  const siteOptions = useMemo(() => uniqueSorted((parts ?? []).map((p) => p.inventorySite)), [parts]);
  const binOptions = useMemo(() => uniqueSorted((parts ?? []).map((p) => p.binLocation)), [parts]);
  const mfrOptions = useMemo(() => uniqueSorted((parts ?? []).map((p) => p.manufacturer)), [parts]);

  const siteCounts = useMemo(() => countBy((parts ?? []).map((p) => p.inventorySite)), [parts]);
  const binCounts = useMemo(() => countBy((parts ?? []).map((p) => p.binLocation)), [parts]);
  const mfrCounts = useMemo(() => countBy((parts ?? []).map((p) => p.manufacturer)), [parts]);

  const handleClearAll = () => {
    setSearchInput('');
    clearAll();
  };

  const toggleStatus = (key: (typeof statuses)[number]) => {
    set({ statuses: statuses.includes(key) ? statuses.filter((s) => s !== key) : [...statuses, key] });
  };

  const chips = [
    sites.length > 0 && { key: 'sites', label: `Inventory Site: ${sites.join(', ')}`, onRemove: () => set({ sites: [] }) },
    bins.length > 0 && { key: 'bins', label: `Bin Location: ${bins.join(', ')}`, onRemove: () => set({ bins: [] }) },
    manufacturers.length > 0 && {
      key: 'manufacturers',
      label: `Manufacturer: ${manufacturers.join(', ')}`,
      onRemove: () => set({ manufacturers: [] }),
    },
    statuses.length > 0 && {
      key: 'statuses',
      label: `Status: ${statuses.map((s) => STATUS_OPTIONS.find((o) => o.key === s)?.label ?? s).join(', ')}`,
      onRemove: () => set({ statuses: [] }),
    },
  ].filter((c): c is { key: string; label: string; onRemove: () => void } => !!c);

  return (
    <div className="relative rounded-card bg-surfaceMuted p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
          <Input
            className="pl-9"
            placeholder="Search SKU, description, manufacturer, site, or bin"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <div className="w-full sm:w-48">
          <SelectDropdown
            icon={<ArrowUpDown size={14} />}
            options={SORT_OPTIONS}
            value={sort}
            valuePrefix="Sort: "
            valueClassName="text-center"
            triggerClassName="font-medium text-textPri"
            onChange={(v) => set({ sort: v as SortKey })}
          />
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-btn border border-border bg-surface px-4 text-xs font-medium text-textPri hover:bg-surfaceMuted sm:w-auto"
        >
          <Filter size={14} />
          Filters
          {chips.length > 0 && (
            <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
              {chips.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setAddPartOpen(true)}
          className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-btn bg-primary px-4 text-xs font-medium text-white hover:bg-primaryHover sm:w-auto"
        >
          <Plus size={14} />
          Add Part
        </button>
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <span
              key={c.key}
              className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-border bg-surface px-2.5 py-1 text-xs text-textMuted"
            >
              <span className="max-w-[220px] truncate">{c.label}</span>
              <button
                type="button"
                onClick={c.onRemove}
                aria-label={`Remove ${c.label}`}
                className="min-h-0 shrink-0 rounded-full hover:text-primary"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <button type="button" onClick={handleClearAll} className="text-xs font-semibold text-primary hover:underline">
            Clear All
          </button>
        </div>
      )}

      {drawerOpen && (
        <FilterDrawer
          onClose={() => setDrawerOpen(false)}
          onClearAll={handleClearAll}
          siteOptions={siteOptions}
          siteCounts={siteCounts}
          sites={sites}
          onSitesChange={(next) => set({ sites: next })}
          binOptions={binOptions}
          binCounts={binCounts}
          bins={bins}
          onBinsChange={(next) => set({ bins: next })}
          mfrOptions={mfrOptions}
          mfrCounts={mfrCounts}
          manufacturers={manufacturers}
          onManufacturersChange={(next) => set({ manufacturers: next })}
          statuses={statuses}
          onToggleStatus={toggleStatus}
        />
      )}

      {addPartOpen && (
        <AddPartModal
          onClose={() => setAddPartOpen(false)}
          manufacturerOptions={mfrOptions}
          siteOptions={siteOptions}
        />
      )}
    </div>
  );
}
