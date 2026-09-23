import { useEffect, useMemo, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpDown, Filter, Plus, Search, X } from 'lucide-react';
import { useInventoryParts } from '../hooks/useInventoryParts';
import { useSalesStatus } from '../hooks/useSales';
import { useUIStore, type SortKey } from '../state/useUIStore';
import { cn } from '../lib/cn';
import { AddPartModal } from './AddPartModal';
import { DISCREPANCY_LABELS } from '@warehouse/shared';
import { AGE_OPTIONS, FilterDrawer, RESEARCH_OPTIONS, SALE_OPTIONS, STATUS_OPTIONS, TASK_OPTIONS } from './FilterDrawer';
import { Input } from './ui/Input';
import { SelectDropdown } from './ui/SelectDropdown';

/** Reads as a value in the menu, so "no second sort" needs no separate control. */
const NO_SECOND_SORT = 'None';

/** The round buttons a phone gets instead of four stacked full-width controls. */
const ROUND = 'flex h-11 w-11 min-h-0 shrink-0 items-center justify-center rounded-full border';
const ROUND_PLAIN = `${ROUND} border-border bg-surface text-textPri`;

const SORT_OPTIONS: SortKey[] = [
  'SKU',
  'Bin Location',
  'Recovery Bin',
  'Manufacturer',
  'Inventory Site',
  'Quantity On Hand',
  'Progress',
  'Revenue Priority',
  'Field Review Priority',
  'Recovery Price',
  'Gross Margin',
  'Watchers',
  'Views',
  'Impressions',
  'Qty Listed',
];

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
  const { data: status } = useSalesStatus();
  const {
    search,
    sites,
    bins,
    recoveryBins,
    manufacturers,
    statuses,
    completedTasks,
    research,
    sales,
    progress,
    ages,
    margins,
    discrepancies,
    needsReview,
    sort,
    sortThen,
    set,
    clearAll,
  } = useUIStore();
  const [searchInput, setSearchInput] = useState(search);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addPartOpen, setAddPartOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => set({ search: searchInput }), 250);
    return () => clearTimeout(timer);
  }, [searchInput, set]);

  const siteOptions = useMemo(() => uniqueSorted((parts ?? []).map((p) => p.inventorySite)), [parts]);
  const binOptions = useMemo(() => uniqueSorted((parts ?? []).map((p) => p.binLocation)), [parts]);
  const recoveryBinOptions = useMemo(() => uniqueSorted((parts ?? []).map((p) => p.newBinLocation)), [parts]);
  const mfrOptions = useMemo(() => uniqueSorted((parts ?? []).map((p) => p.manufacturer)), [parts]);

  const siteCounts = useMemo(() => countBy((parts ?? []).map((p) => p.inventorySite)), [parts]);
  const binCounts = useMemo(() => countBy((parts ?? []).map((p) => p.binLocation)), [parts]);
  const recoveryBinCounts = useMemo(() => countBy((parts ?? []).map((p) => p.newBinLocation)), [parts]);
  const mfrCounts = useMemo(() => countBy((parts ?? []).map((p) => p.manufacturer)), [parts]);

  const handleClearAll = () => {
    setSearchInput('');
    clearAll();
  };

  const toggleStatus = (key: (typeof statuses)[number]) => {
    set({ statuses: statuses.includes(key) ? statuses.filter((s) => s !== key) : [...statuses, key] });
  };

  const toggleProgress = (key: number) => {
    set({ progress: progress.includes(key) ? progress.filter((x) => x !== key) : [...progress, key] });
  };

  const toggleAge = (key: (typeof ages)[number]) => {
    set({ ages: ages.includes(key) ? ages.filter((x) => x !== key) : [...ages, key] });
  };

  const toggleSale = (key: (typeof sales)[number]) => {
    set({ sales: sales.includes(key) ? sales.filter((x) => x !== key) : [...sales, key] });
  };

  const toggleResearch = (key: (typeof research)[number]) => {
    set({ research: research.includes(key) ? research.filter((r) => r !== key) : [...research, key] });
  };

  const toggleTask = (key: (typeof completedTasks)[number]) => {
    set({
      completedTasks: completedTasks.includes(key)
        ? completedTasks.filter((t) => t !== key)
        : [...completedTasks, key],
    });
  };

  const toggleMargin = (key: (typeof margins)[number]) => {
    set({ margins: margins.includes(key) ? margins.filter((m) => m !== key) : [...margins, key] });
  };

  const toggleDiscrepancy = (key: (typeof discrepancies)[number]) => {
    set({ discrepancies: discrepancies.includes(key) ? discrepancies.filter((d) => d !== key) : [...discrepancies, key] });
  };

  const chips = [
    sites.length > 0 && { key: 'sites', label: `Inventory Site: ${sites.join(', ')}`, onRemove: () => set({ sites: [] }) },
    bins.length > 0 && { key: 'bins', label: `Bin Location: ${bins.join(', ')}`, onRemove: () => set({ bins: [] }) },
    recoveryBins.length > 0 && {
      key: 'recoveryBins',
      label: `Recovery Bin: ${recoveryBins.join(', ')}`,
      onRemove: () => set({ recoveryBins: [] }),
    },
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
    completedTasks.length > 0 && {
      key: 'completedTasks',
      label: `Completed: ${completedTasks.map((t) => TASK_OPTIONS.find((o) => o.key === t)?.label ?? t).join(', ')}`,
      onRemove: () => set({ completedTasks: [] }),
    },
    progress.length > 0 && {
      key: 'progress',
      label: `Steps: ${[...progress].sort().map((n) => `${n}/5`).join(', ')}`,
      onRemove: () => set({ progress: [] }),
    },
    ages.length > 0 && {
      key: 'ages',
      label: `Last touched: ${ages.map((a) => AGE_OPTIONS.find((o) => o.key === a)?.label ?? a).join(', ')}`,
      onRemove: () => set({ ages: [] }),
    },
    sales.length > 0 && {
      key: 'sales',
      label: `Sales: ${sales.map((x) => SALE_OPTIONS.find((o) => o.key === x)?.label ?? x).join(', ')}`,
      onRemove: () => set({ sales: [] }),
    },
    research.length > 0 && {
      key: 'research',
      label: `Research: ${research.map((r) => RESEARCH_OPTIONS.find((o) => o.key === r)?.label ?? r).join(', ')}`,
      onRemove: () => set({ research: [] }),
    },
    margins.length > 0 && {
      key: 'margins',
      label: `Margin: ${margins.map((m) => m.replace(' Gross Margin', '')).join(', ')}`,
      onRemove: () => set({ margins: [] }),
    },
    needsReview && {
      key: 'needsReview',
      label: 'Flagged for review',
      onRemove: () => set({ needsReview: false }),
    },
    discrepancies.length > 0 && {
      key: 'discrepancies',
      label: `Qty: ${discrepancies.map((d) => DISCREPANCY_LABELS[d]).join(', ')}`,
      onRemove: () => set({ discrepancies: [] }),
    },
  ].filter((c): c is { key: string; label: string; onRemove: () => void } => !!c);

  return (
    <div className="relative rounded-card bg-surfaceMuted p-4 lg:p-1.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
          <Input
            className={cn('pl-9', searchInput && 'pr-9')}
            placeholder="Search SKU, description, manufacturer, site, or bin"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex h-7 w-7 min-h-0 -translate-y-1/2 items-center justify-center rounded-full text-textMuted hover:bg-surfaceMuted hover:text-textPri"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* A phone gets one row of round buttons: four stacked full-width controls took a
            third of the screen before any stock appeared. Each still opens the same menu,
            and a dot marks a sort or filter that is set. */}
        <div className="flex items-center justify-between gap-2 sm:hidden">
          <SelectDropdown
            options={SORT_OPTIONS}
            value={sort}
            onChange={(v) => set({ sort: v as SortKey })}
            renderTrigger={({ open }) => (
              <span
                className={cn(ROUND_PLAIN, open && 'border-primary ring-2 ring-primary/40')}
                title={`Sort: ${sort}`}
              >
                <ArrowUpDown size={18} />
              </span>
            )}
          />
          <SelectDropdown
            options={[NO_SECOND_SORT, ...SORT_OPTIONS.filter((o) => o !== sort)]}
            value={sortThen ?? NO_SECOND_SORT}
            onChange={(v) => set({ sortThen: v === NO_SECOND_SORT ? null : (v as SortKey) })}
            renderTrigger={({ open }) => (
              <span
                className={cn(ROUND_PLAIN, 'relative', open && 'border-primary ring-2 ring-primary/40')}
                title={`Second sort: ${sortThen ?? 'none'}`}
              >
                <ArrowDownWideNarrow size={18} />
                {sortThen && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />}
              </span>
            )}
          />
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={chips.length ? `Filters, ${chips.length} set` : 'Filters'}
            className={cn(ROUND_PLAIN, 'relative')}
          >
            <Filter size={18} />
            {chips.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                {chips.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setAddPartOpen(true)}
            aria-label="Add part"
            className={cn(ROUND, 'border-primary bg-primary text-white')}
          >
            <Plus size={20} />
          </button>
        </div>

        <div className="hidden w-full sm:block sm:w-48">
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

        {/* A second key, for walking shelves in order or ranking within a site. Only ever
            breaks ties in the first, so it can be ignored entirely. Narrower than the first
            sort: a tie-breaker is the smaller decision. */}
        <div className="hidden w-full sm:block sm:w-40">
          <SelectDropdown
            options={[NO_SECOND_SORT, ...SORT_OPTIONS.filter((o) => o !== sort)]}
            value={sortThen ?? NO_SECOND_SORT}
            valuePrefix="Sort (2): "
            valueClassName="text-center"
            triggerClassName="font-medium text-textPri"
            onChange={(v) => set({ sortThen: v === NO_SECOND_SORT ? null : (v as SortKey) })}
          />
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="hidden h-11 shrink-0 items-center justify-center gap-2 rounded-btn border border-border bg-surface px-4 text-xs font-medium text-textPri hover:bg-surfaceMuted sm:flex sm:w-auto"
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
          className="hidden h-11 shrink-0 items-center justify-center gap-2 rounded-btn bg-primary px-4 text-xs font-medium text-white hover:bg-primaryHover sm:flex sm:w-auto"
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
          recoveryBinOptions={recoveryBinOptions}
          recoveryBinCounts={recoveryBinCounts}
          recoveryBins={recoveryBins}
          onRecoveryBinsChange={(next) => set({ recoveryBins: next })}
          mfrOptions={mfrOptions}
          mfrCounts={mfrCounts}
          manufacturers={manufacturers}
          onManufacturersChange={(next) => set({ manufacturers: next })}
          statuses={statuses}
          onToggleStatus={toggleStatus}
          completedTasks={completedTasks}
          onToggleTask={toggleTask}
          margins={margins}
          onToggleMargin={toggleMargin}
          discrepancies={discrepancies}
          onToggleDiscrepancy={toggleDiscrepancy}
          research={research}
          onToggleResearch={toggleResearch}
          sales={sales}
          onToggleSale={toggleSale}
          progress={progress}
          onToggleProgress={toggleProgress}
          ages={ages}
          onToggleAge={toggleAge}
          researchEnabled={!!status?.research}
          needsReview={needsReview}
          onToggleNeedsReview={() => set({ needsReview: !needsReview })}
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
