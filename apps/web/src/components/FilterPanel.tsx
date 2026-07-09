import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, Factory, MapPin, RefreshCw, Search, Wrench, X } from 'lucide-react';
import { PARTS_QUERY_KEY, useInventoryParts } from '../hooks/useInventoryParts';
import { useUIStore, type SortKey } from '../state/useUIStore';
import { Dropdown } from './ui/Dropdown';
import { Input } from './ui/Input';
import { MultiSelectDropdown } from './ui/MultiSelectDropdown';

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
  const { search, sites, bins, manufacturers, sort, set, clearAll } = useUIStore();
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState(search);

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

  return (
    <div className="relative rounded-card bg-surfaceMuted p-4">
      <div className="relative mb-4">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
        <Input
          className="pl-9"
          placeholder="Search SKU, description, manufacturer, site, or bin"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="w-full sm:w-56">
          <MultiSelectDropdown
            icon={<Factory size={14} />}
            label="Inventory Site"
            options={siteOptions}
            selected={sites}
            counts={siteCounts}
            onChange={(next) => set({ sites: next })}
          />
        </div>
        <div className="w-full sm:w-56">
          <MultiSelectDropdown
            icon={<MapPin size={14} />}
            label="Bin Location"
            options={binOptions}
            selected={bins}
            counts={binCounts}
            onChange={(next) => set({ bins: next })}
          />
        </div>
        <div className="w-full sm:w-56">
          <MultiSelectDropdown
            icon={<Wrench size={14} />}
            label="Manufacturer"
            options={mfrOptions}
            selected={manufacturers}
            counts={mfrCounts}
            onChange={(next) => set({ manufacturers: next })}
          />
        </div>
        <div className="flex w-full items-center gap-2 rounded-btn border border-border bg-surface px-3 py-2 sm:w-56">
          <ArrowUpDown size={14} className="shrink-0 text-textMuted" />
          <Dropdown
            variant="bare"
            options={SORT_OPTIONS}
            value={sort}
            onChange={(e) => set({ sort: e.target.value as SortKey })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:contents">
          <button
            type="button"
            onClick={handleClearAll}
            className="flex items-center justify-center gap-1.5 rounded-btn border border-border bg-surface px-3 py-2 text-xs text-textMuted hover:bg-white hover:text-primary sm:justify-start"
          >
            <X size={14} />
            Clear All
          </button>

          <button
            onClick={() => qc.invalidateQueries({ queryKey: PARTS_QUERY_KEY })}
            className="flex items-center justify-center gap-1.5 rounded-btn border border-border bg-surface px-3 py-2 text-xs text-textMuted hover:bg-white hover:text-primary sm:ml-auto sm:justify-start"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
