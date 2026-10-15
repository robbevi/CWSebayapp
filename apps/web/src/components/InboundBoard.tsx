import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpDown,
  Boxes,
  ChevronDown,
  Coins,
  Container,
  DollarSign,
  Download,
  Factory,
  Filter,
  Layers,
  MapPin,
  Package,
  PackagePlus,
  Search,
  Truck,
  Wrench,
  X,
} from 'lucide-react';
import {
  cratesOf,
  CSV_BOM,
  csvCell,
  nextCrateLabel,
  normalizeCrate,
  type InboundItem,
  type InboundStatus,
} from '@warehouse/shared';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useInbound, usePackInbound, useUnpackInbound } from '../hooks/useInbound';
import { cn } from '../lib/cn';
import {
  applyInboundView,
  countBy,
  INBOUND_SORTS,
  inboundChips,
  inboundValue,
  uniqueSorted,
  type InboundSort,
  type InboundView,
} from '../lib/inboundView';
import { useUIStore } from '../state/useUIStore';
import { Card } from './StatStrip';
import { Input } from './ui/Input';
import { MultiSelectDropdown } from './ui/MultiSelectDropdown';
import { Pill } from './ui/Pill';
import { SelectDropdown } from './ui/SelectDropdown';

/**
 * A district's stock on its way to Williston, as a board of its own: what is still on its
 * shelves, what is packed in a crate, and what is on the road. Received stock leaves this
 * board — it is Williston's from then on, on the Williston board.
 *
 * Kept apart from Williston's board rather than mixed into it: the same SKU stocked in both
 * places would otherwise fold into one card and one eBay listing before it has arrived. It
 * is drawn like Williston's, though — the same toolbar, column heads and cards — so it
 * reads as the same app.
 */

type Column = Exclude<InboundStatus, 'received'>;
const COLUMNS: { status: Column; label: string; hint: string; icon: ReactNode; badge: string }[] = [
  { status: 'awaiting', label: 'To pack', hint: 'On the shelf, waiting for a crate', icon: <Boxes size={18} />, badge: 'bg-blue-500' },
  { status: 'packed', label: 'Packed', hint: 'In a crate that hasn’t shipped', icon: <Container size={18} />, badge: 'bg-amber-500' },
  { status: 'shipped', label: 'In transit', hint: 'On its way to Williston', icon: <Truck size={18} />, badge: 'bg-primary' },
];

const value = inboundValue;

/** Cards drawn per column at a time, as on Williston's board. */
const PAGE = 40;

// Williston's toolbar, borrowed: round icon buttons on a phone, labelled from sm up.
const ROUND =
  'flex h-11 min-h-0 shrink-0 items-center justify-center gap-2 rounded-full border w-11 sm:h-12 sm:w-auto sm:px-5';
const ROUND_PLAIN = `${ROUND} border-border bg-surface text-textPri`;
const PILL_LABEL = 'hidden text-sm font-medium sm:inline';

const usd = (n: number, cents = false) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 });
type Filters = Pick<InboundView, 'sites' | 'bins' | 'makers'>;
const NO_FILTERS: Filters = { sites: [], bins: [], makers: [] };

export function InboundBoard({ origin, onOpenPacking }: { origin: string; onOpenPacking: () => void }) {
  const { data, isLoading } = useInbound();
  const all = useMemo(() => (data ?? []).filter((i) => i.origin === origin && i.status !== 'received'), [data, origin]);
  // Shared with the packing list, so "Pack Multiple" opens on what the board shows.
  const view = useUIStore((s) => s.inboundView);
  const setView = useUIStore((s) => s.setInboundView);
  const { search, sort } = view;
  const setSearch = (v: string) => setView({ search: v });
  const setSort = (v: InboundSort) => setView({ sort: v });
  const setFilters = (f: Filters) => setView(f);
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<InboundItem | null>(null);
  const [focused, setFocused] = useState<Column | null>(null);

  const shown = useMemo(() => applyInboundView(all, view), [all, view]);
  const chips = inboundChips(view, setView);
  const narrowed = !!search.trim() || chips.length > 0;
  const received = useMemo(() => (data ?? []).filter((i) => i.origin === origin && i.status === 'received'), [data, origin]);
  const crates = cratesOf(all);
  const packed = all.filter((i) => i.status === 'packed');

  if (isLoading) return <div className="py-16 text-center text-textMuted">Loading {origin}…</div>;

  const exportShown = () => {
    const header = ['SKU', 'Description', 'Manufacturer', `${origin} Site`, `${origin} Bin`, 'Qty', 'Avg Unit Cost', 'Value', 'Status', 'Crate', 'Packed', 'Shipped'];
    const label: Record<InboundStatus, string> = { awaiting: 'To pack', packed: 'Packed', shipped: 'In transit', received: 'Received' };
    const lines = [header, ...shown.map((i) => [i.sku, i.description, i.manufacturer, i.originSite, i.originBin, i.qty, i.unitCost, Math.round(value(i) * 100) / 100, label[i.status], i.crate, i.packedAt?.slice(0, 10) ?? '', i.shippedAt?.slice(0, 10) ?? ''])];
    const csv = lines.map((l) => l.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([CSV_BOM, csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${origin.toLowerCase().replace(/\s+/g, '-')}-inbound-${new Date().toISOString().slice(0, 10)}${narrowed ? '-filtered' : ''}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const sortDropdownMobile = (
    <SelectDropdown
      options={[...INBOUND_SORTS]}
      value={sort}
      onChange={(v) => setSort(v as InboundSort)}
      renderTrigger={({ open }) => (
        <span className={cn(ROUND_PLAIN, open && 'border-primary ring-2 ring-primary/40')} title={`Sort: ${sort}`}>
          <ArrowUpDown size={18} />
          <span className={PILL_LABEL}>Sort</span>
        </span>
      )}
    />
  );

  return (
    <>
      <div className="relative hidden gap-3 lg:grid lg:grid-cols-5">
        <Card label={`At ${origin}`} value={all.length.toLocaleString()} icon={<Layers size={13} />}>
          {uniqueSorted(all.map((i) => i.sku)).length.toLocaleString()} SKUs · {uniqueSorted(all.map((i) => i.originSite)).length} sites
        </Card>
        <Card label="Units" value={all.reduce((n, i) => n + i.qty, 0).toLocaleString()} icon={<Boxes size={13} />}>
          still to reach Williston
        </Card>
        <Card label="Value" value={usd(all.reduce((n, i) => n + value(i), 0))} icon={<Coins size={13} />}>
          at average unit cost
        </Card>
        <Card label="Packed" value={packed.reduce((n, i) => n + i.qty, 0).toLocaleString()} icon={<Container size={13} />}>
          units in {crates.filter((c) => c.status === 'packed').length} open {crates.filter((c) => c.status === 'packed').length === 1 ? 'crate' : 'crates'}
        </Card>
        <Card label="Crates on the way" value={crates.filter((c) => c.status === 'shipped').length.toLocaleString()} icon={<Truck size={13} />}>
          {received.length ? `${received.reduce((n, i) => n + (i.receivedQty ?? 0), 0).toLocaleString()} units received so far` : 'none received yet'}
        </Card>
      </div>

      <div className="relative rounded-card bg-surfaceMuted p-0 lg:p-1.5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
          <div className={cn('relative flex-1', !searchOpen && !search && 'hidden lg:block')}>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
            <Input
              className={cn('pl-9', search && 'pr-9')}
              placeholder={`Search ${origin} SKU, description, manufacturer, bin or crate`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 flex h-7 w-7 min-h-0 -translate-y-1/2 items-center justify-center rounded-full text-textMuted hover:bg-surfaceMuted hover:text-textPri"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label={searchOpen ? 'Hide search' : 'Search'}
              aria-expanded={searchOpen}
              className={cn(ROUND_PLAIN, (searchOpen || search) && 'border-primary text-primary')}
            >
              <Search size={18} />
              <span className={PILL_LABEL}>Search</span>
            </button>
            {sortDropdownMobile}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={chips.length ? `Filters, ${chips.length} set` : 'Filters'}
              className={cn(ROUND_PLAIN, 'relative')}
            >
              <Filter size={18} />
              <span className={PILL_LABEL}>Filter</span>
              {chips.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                  {chips.length}
                </span>
              )}
            </button>
            <button type="button" onClick={exportShown} aria-label="Export" className={cn(ROUND, 'border-primary bg-primary text-white')}>
              <Download size={20} />
              <span className={PILL_LABEL}>Export</span>
            </button>
          </div>

          <div className="hidden w-full lg:block lg:w-48">
            <SelectDropdown
              icon={<ArrowUpDown size={14} />}
              options={[...INBOUND_SORTS]}
              value={sort}
              valuePrefix="Sort: "
              valueClassName="text-center"
              triggerClassName="font-medium text-textPri"
              onChange={(v) => setSort(v as InboundSort)}
            />
          </div>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="hidden h-11 shrink-0 items-center justify-center gap-2 rounded-btn border border-border bg-surface px-4 text-xs font-medium text-textPri hover:bg-surfaceMuted lg:flex lg:w-auto"
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
            onClick={exportShown}
            title={`Export what is shown of ${origin}'s stock to a spreadsheet`}
            className="hidden h-11 shrink-0 items-center justify-center gap-2 rounded-btn bg-primary px-4 text-xs font-medium text-white hover:bg-primaryHover lg:flex lg:w-auto"
          >
            <Download size={14} />
            Export
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
                <button type="button" onClick={c.remove} aria-label={`Remove ${c.label}`} className="min-h-0 shrink-0 rounded-full hover:text-primary">
                  <X size={12} />
                </button>
              </span>
            ))}
            <button type="button" onClick={() => setFilters(NO_FILTERS)} className="text-xs font-semibold text-primary hover:underline">
              Clear All
            </button>
          </div>
        )}
      </div>

      <div className="lg:min-h-0 lg:flex-1">
        <div className="mx-auto grid w-full grid-cols-1 gap-4 lg:h-full lg:grid-cols-3">
          {COLUMNS.map((c) => (
            <InboundColumn
              key={c.status}
              column={c}
              items={shown.filter((i) => i.status === c.status)}
              total={all.filter((i) => i.status === c.status).length}
              expanded={focused === c.status}
              onToggle={() => setFocused((f) => (f === c.status ? null : c.status))}
              className={focused === c.status ? 'order-first lg:order-none' : undefined}
              onSelect={setSelected}
              action={
                c.status === 'awaiting' ? (
                  <button
                    type="button"
                    onClick={onOpenPacking}
                    title="Pack several parts into a crate at once, from the list as filtered and sorted here"
                    className="flex min-h-0 shrink-0 items-center gap-1 rounded-pill border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-textPri hover:bg-surfaceMuted"
                  >
                    <PackagePlus size={12} />
                    <span className="hidden sm:inline">Pack Multiple</span>
                  </button>
                ) : null
              }
            />
          ))}
        </div>
      </div>

      {drawerOpen && <InboundFilterDrawer all={all} filters={view} onChange={setFilters} onClose={() => setDrawerOpen(false)} />}
      {selected && <InboundItemDialog item={selected} all={data ?? []} onClose={() => setSelected(null)} />}
    </>
  );
}

/** The same sheet as Williston's filters, with what a district's stock can be narrowed by. */
function InboundFilterDrawer({
  all,
  filters,
  onChange,
  onClose,
}: {
  all: InboundItem[];
  filters: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
}) {
  useBodyScrollLock();
  const field = (label: string, icon: ReactNode, options: string[], counts: Record<string, number>, key: keyof Filters) => (
    <div>
      <label className="mb-1 block text-xs font-semibold text-textMuted">{label}</label>
      <MultiSelectDropdown
        icon={icon}
        label={label}
        options={options}
        counts={counts}
        selected={filters[key]}
        onChange={(next) => onChange({ ...filters, [key]: next })}
      />
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-6">
      <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-card bg-surface sm:max-w-md">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surfaceMuted p-4">
          <h2 className="text-base font-semibold text-textPri">Filters</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange(NO_FILTERS)}
              className="flex h-9 min-h-0 items-center rounded-btn border border-border px-3 text-xs font-semibold text-primary hover:bg-surfaceMuted"
            >
              Clear All
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-9 w-9 min-h-0 items-center justify-center rounded-btn border border-border text-textMuted hover:bg-surfaceMuted hover:text-textPri"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          {field('Inventory Site', <Factory size={14} />, uniqueSorted(all.map((i) => i.originSite)), countBy(all.map((i) => i.originSite)), 'sites')}
          {field('Bin Location', <MapPin size={14} />, uniqueSorted(all.map((i) => i.originBin)), countBy(all.map((i) => i.originBin)), 'bins')}
          {field('Manufacturer', <Wrench size={14} />, uniqueSorted(all.map((i) => i.manufacturer)), countBy(all.map((i) => i.manufacturer)), 'makers')}
        </div>
        <div className="shrink-0 border-t border-border p-4">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-full items-center justify-center rounded-btn bg-primary text-sm font-semibold text-white hover:bg-primaryHover"
          >
            Show results
          </button>
        </div>
      </div>
    </div>
  );
}

function InboundColumn({
  column,
  items,
  total,
  expanded,
  onToggle,
  className,
  onSelect,
  action,
}: {
  column: (typeof COLUMNS)[number];
  items: InboundItem[];
  total: number;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
  onSelect: (i: InboundItem) => void;
  action: ReactNode;
}) {
  const [rendered, setRendered] = useState(PAGE);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const filtered = items.length !== total;
  const worth = items.reduce((n, i) => n + value(i), 0);

  // A new filter starts the column from the top again.
  useEffect(() => setRendered(PAGE), [items]);

  // Draws the next page as the end of the column comes into view, as Williston's does.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setRendered((n) => Math.min(n + PAGE, items.length));
      },
      { root: scrollRef.current, rootMargin: '400px' }
    );
    seen.observe(sentinel);
    return () => seen.disconnect();
  }, [rendered, items.length, expanded]);

  return (
    <div className={cn('flex flex-col rounded-card border border-border bg-surfaceMuted lg:h-full lg:min-h-0', className)}>
      <div className="flex w-full items-center gap-3 rounded-t-card border-b border-border bg-columnHeaderBg p-4" title={column.hint}>
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex flex-1 items-center gap-3 text-left lg:pointer-events-none">
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white', column.badge)}>{column.icon}</div>
          <span className="min-w-0">
            <span className="block text-base font-medium text-textPri lg:text-lg">{column.label}</span>
            <span className="hidden text-[11px] leading-tight text-textMuted lg:block">
              <span className="font-semibold tabular-nums text-textPri">{usd(worth)}</span> at average cost
            </span>
          </span>
        </button>
        {action}
        <span
          className="rounded-pill border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-textMuted"
          title={filtered ? `${items.length} of ${total} shown by the current filters` : undefined}
        >
          {items.length.toLocaleString()}
          {filtered && <span className="font-normal text-textMuted/70"> of {total.toLocaleString()}</span>}
        </span>
        <button type="button" onClick={onToggle} aria-label={expanded ? 'Collapse' : 'Expand'} className="min-h-0 shrink-0 lg:hidden">
          <ChevronDown size={18} className={cn('text-textMuted transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'column-scroll min-h-0 max-h-[calc(100vh-15rem)] flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4 lg:flex lg:max-h-none',
          expanded ? 'flex' : 'hidden'
        )}
      >
        {items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-card border border-dashed border-border p-8 text-center text-xs text-textMuted">
            {total === 0 ? 'Nothing here yet.' : 'No parts match the selected filters here.'}
          </div>
        ) : (
          <>
            {items.slice(0, rendered).map((i) => (
              <InboundCard key={i.id} item={i} onSelect={() => onSelect(i)} />
            ))}
            {rendered < items.length && (
              <div ref={sentinelRef} className="py-3 text-center text-[11px] text-textMuted">
                Showing {rendered} of {items.length.toLocaleString()}…
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Williston's card, saying what a part on its way needs to: where it sits, how many, what it cost, and its crate. */
function InboundCard({ item, onSelect }: { item: InboundItem; onSelect: () => void }) {
  return (
    <div className="shrink-0 overflow-hidden rounded-[10px] border border-border bg-surface transition-shadow hover:shadow-md">
      <button type="button" onClick={onSelect} className="w-full p-3 text-left">
        <div className="flex items-start gap-1.5">
          <span className="min-w-0 flex-1 text-sm font-semibold text-textPri">{item.sku}</span>
          {item.crate && (
            <span
              title={`In crate ${item.crate}`}
              className="flex shrink-0 items-center gap-1 rounded-pill bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
            >
              <Container size={11} /> {item.crate}
            </span>
          )}
        </div>
        <div className="mb-2 line-clamp-2 min-h-[2rem] text-xs leading-snug text-textMuted">{item.description}</div>
        <div className="grid grid-cols-2 gap-1.5">
          <Pill tone="chip" className="w-full">
            <Wrench size={12} className="shrink-0" />
            <span className="truncate">{item.manufacturer || '—'}</span>
          </Pill>
          <Pill tone="chip" className="w-full">
            <Factory size={12} className="shrink-0" />
            <span className="truncate">{item.originSite || '—'}</span>
          </Pill>
          <Pill tone="chip" className="w-full">
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">{item.originBin || '—'}</span>
          </Pill>
          <Pill tone="chip" className="w-full">
            <Package size={12} className="shrink-0" />
            <span className="truncate">Qty: {item.qty.toLocaleString()}</span>
          </Pill>
          {item.unitCost != null && (
            <Pill tone="chip" className="w-full">
              <DollarSign size={12} className="shrink-0" />
              <span className="truncate" title={`${usd(value(item), true)} for ${item.qty}`}>
                {usd(item.unitCost, true)} ea
              </span>
            </Pill>
          )}
        </div>
      </button>
    </div>
  );
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '—';

/** One part on its way: what it is, where it sits, and adding it to — or taking it out of — a crate. */
function InboundItemDialog({ item, all, onClose }: { item: InboundItem; all: InboundItem[]; onClose: () => void }) {
  useBodyScrollLock(true);
  const openCrates = cratesOf(all).filter((c) => c.status === 'packed' && c.origin === item.origin);
  const [qty, setQty] = useState(item.qty);
  const [crate, setCrate] = useState(openCrates[0]?.label ?? nextCrateLabel(all, item.origin));
  const pack = usePackInbound();
  const unpack = useUnpackInbound();

  const rows: [string, string][] = [
    ['Manufacturer', item.manufacturer || '—'],
    [`${item.origin} site`, item.originSite || '—'],
    [`${item.origin} bin`, item.originBin || '—'],
    ['Quantity', item.qty.toLocaleString()],
    ['Average unit cost', item.unitCost == null ? '—' : usd(item.unitCost, true)],
    ['Value', item.unitCost == null ? '—' : usd(value(item), true)],
    ...(item.crate ? ([['Crate', item.crate]] as [string, string][]) : []),
    ...(item.packedAt ? ([['Packed', `${day(item.packedAt)}${item.packedBy ? ` by ${item.packedBy}` : ''}`]] as [string, string][]) : []),
    ...(item.shippedAt ? ([['Shipped', `${day(item.shippedAt)}${item.shippedBy ? ` by ${item.shippedBy}` : ''}`]] as [string, string][]) : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-6">
      <div className="w-full max-w-md overflow-hidden rounded-card bg-surface">
        <div className="flex items-start justify-between gap-3 border-b border-border bg-surfaceMuted p-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-textPri">{item.sku}</h2>
            <p className="text-xs text-textMuted">{item.description || '—'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 min-h-0 shrink-0 items-center justify-center rounded-btn border border-border text-textMuted hover:bg-surface"
          >
            <X size={18} />
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 p-4 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-textMuted">{k}</dt>
              <dd className="font-semibold text-textPri">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-border p-4">
          {item.status === 'awaiting' ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[11px] font-semibold text-textMuted">
                How many
                <input
                  type="number"
                  min={1}
                  max={item.qty}
                  value={qty}
                  onChange={(e) => setQty(Math.min(item.qty, Math.max(1, Math.trunc(Number(e.target.value)) || 1)))}
                  className="mt-1 block w-20 rounded-btn border border-border bg-surface px-2 py-2 text-right text-xs text-textPri"
                />
              </label>
              <label className="text-[11px] font-semibold text-textMuted">
                Crate
                <input
                  list="item-open-crates"
                  value={crate}
                  onChange={(e) => setCrate(e.target.value)}
                  className="mt-1 block w-28 rounded-btn border border-border bg-surface px-2 py-2 text-xs font-semibold uppercase text-textPri"
                />
                <datalist id="item-open-crates">
                  {openCrates.map((c) => (
                    <option key={c.label} value={c.label} />
                  ))}
                  <option value={nextCrateLabel(all, item.origin)} />
                </datalist>
              </label>
              <button
                type="button"
                disabled={!normalizeCrate(crate) || pack.isPending}
                onClick={() =>
                  pack.mutate({ crate, items: [qty === item.qty ? { id: item.id } : { id: item.id, qty }] }, { onSuccess: onClose })
                }
                className={cn('flex min-h-0 flex-1 items-center justify-center gap-1.5 rounded-btn bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primaryHover disabled:opacity-50')}
              >
                <PackagePlus size={13} /> {pack.isPending ? 'Packing…' : 'Add to crate'}
              </button>
            </div>
          ) : item.status === 'packed' ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-textMuted">In crate {item.crate}, not shipped yet.</span>
              <button
                type="button"
                disabled={unpack.isPending}
                onClick={() => unpack.mutate([item.id], { onSuccess: onClose })}
                className="flex min-h-0 items-center gap-1.5 rounded-btn border border-border px-3 py-2 text-xs font-semibold text-textPri hover:bg-surfaceMuted disabled:opacity-50"
              >
                Take out of crate
              </button>
            </div>
          ) : (
            <p className="text-xs text-textMuted">
              On its way to Williston in crate {item.crate}. Williston receives it from the Inbound screen.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
