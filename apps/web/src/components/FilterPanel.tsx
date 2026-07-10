import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Factory, MapPin, Search, Wrench, X } from 'lucide-react';
import { useInventoryParts } from '../hooks/useInventoryParts';
import { useUIStore, type SortKey } from '../state/useUIStore';
import { Input } from './ui/Input';
import { MultiSelectDropdown } from './ui/MultiSelectDropdown';
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
  const { search, sites, bins, manufacturers, sort, set, clearAll } = useUIStore();
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

      <div className="flex flex-row items-center gap-1.5 sm:flex-wrap sm:gap-3">
        <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
          <MultiSelectDropdown
            icon={<Factory size={14} />}
            label="Inventory Site"
            mobileLabel="Inv."
            options={siteOptions}
            selected={sites}
            counts={siteCounts}
            onChange={(next) => set({ sites: next })}
          />
        </div>
        <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
          <MultiSelectDropdown
            icon={<MapPin size={14} />}
            label="Bin Location"
            mobileLabel="Bin"
            options={binOptions}
            selected={bins}
            counts={binCounts}
            onChange={(next) => set({ bins: next })}
          />
        </div>
        <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
          <MultiSelectDropdown
            icon={<Wrench size={14} />}
            label="Manufacturer"
            mobileLabel="Mfg."
            options={mfrOptions}
            selected={manufacturers}
            counts={mfrCounts}
            onChange={(next) => set({ manufacturers: next })}
          />
        </div>
        <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
          <SelectDropdown
            icon={<ArrowUpDown size={14} />}
            options={SORT_OPTIONS}
            value={sort}
            onChange={(v) => set({ sort: v as SortKey })}
          />
        </div>

        <button
          type="button"
          onClick={handleClearAll}
          aria-label="Clear All"
          title="Clear All"
          className="flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-btn border border-border bg-surface text-textMuted hover:bg-white hover:text-primary sm:h-auto sm:w-auto sm:px-3 sm:py-2"
        >
          <X size={14} />
          <span className="hidden sm:inline">Clear All</span>
        </button>
      </div>
    </div>
  );
}
