import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, Filter, MapPin, RefreshCw, Search, Wrench } from 'lucide-react';
import { PARTS_QUERY_KEY, useInventoryParts } from '../hooks/useInventoryParts';
import { useUIStore, type SortKey } from '../state/useUIStore';
import { Dropdown } from './ui/Dropdown';
import { Input } from './ui/Input';

function uniqueSorted(values: (string | undefined)[]): string[] {
  return ['All', ...Array.from(new Set(values.filter((v): v is string => !!v))).sort()];
}

export function FilterPanel() {
  const { data: parts } = useInventoryParts();
  const { search, site, bin, mfr, sort, set } = useUIStore();
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => set({ search: searchInput }), 250);
    return () => clearTimeout(timer);
  }, [searchInput, set]);

  const sites = useMemo(() => uniqueSorted((parts ?? []).map((p) => p.inventorySite)), [parts]);
  const bins = useMemo(() => uniqueSorted((parts ?? []).map((p) => p.binLocation)), [parts]);
  const mfrs = useMemo(() => uniqueSorted((parts ?? []).map((p) => p.manufacturer)), [parts]);

  return (
    <div className="relative rounded-card bg-surfaceMuted p-4">
      <button
        onClick={() => qc.invalidateQueries({ queryKey: PARTS_QUERY_KEY })}
        className="absolute right-4 top-4 rounded-btn p-2 text-textMuted hover:bg-white hover:text-primary"
        aria-label="Refresh"
        title="Refresh"
      >
        <RefreshCw size={18} />
      </button>

      <div className="relative mb-4 pr-12">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
        <Input
          className="pl-9"
          placeholder="Search SKU, description, manufacturer, site, bin, notes…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FilterField icon={<Filter size={14} />} label="Site">
          <Dropdown options={sites} value={site} onChange={(e) => set({ site: e.target.value })} />
        </FilterField>
        <FilterField icon={<MapPin size={14} />} label="Bin">
          <Dropdown options={bins} value={bin} onChange={(e) => set({ bin: e.target.value })} />
        </FilterField>
        <FilterField icon={<Wrench size={14} />} label="Manufacturer">
          <Dropdown options={mfrs} value={mfr} onChange={(e) => set({ mfr: e.target.value })} />
        </FilterField>
        <FilterField icon={<ArrowUpDown size={14} />} label="Sort">
          <Dropdown
            options={['Bin', 'SKU', 'Manufacturer', 'Site']}
            value={sort}
            onChange={(e) => set({ sort: e.target.value as SortKey })}
          />
        </FilterField>
      </div>
    </div>
  );
}

function FilterField({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-textMuted">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}
