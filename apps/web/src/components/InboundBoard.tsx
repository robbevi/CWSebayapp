import { useMemo, useState, type ReactNode } from 'react';
import { Boxes, ChevronDown, Coins, Container, Download, Factory, Layers, MapPin, PackagePlus, Search, Truck, X } from 'lucide-react';
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
import { Card } from './StatStrip';
import { Input } from './ui/Input';
import { MultiSelectDropdown } from './ui/MultiSelectDropdown';
import { SelectDropdown } from './ui/SelectDropdown';

/**
 * A district's stock on its way to Williston, as a board of its own: what is still on its
 * shelves, what is packed in a crate, and what is on the road. Received stock leaves this
 * board — it is Williston's from then on, on the Williston board.
 *
 * Kept apart from Williston's board rather than mixed into it: the same SKU stocked in both
 * places would otherwise fold into one card and one eBay listing before it has arrived.
 */

type Column = Exclude<InboundStatus, 'received'>;
const COLUMNS: { status: Column; label: string; hint: string; icon: ReactNode }[] = [
  { status: 'awaiting', label: 'To pack', hint: 'On the shelf, waiting for a crate', icon: <Boxes size={15} /> },
  { status: 'packed', label: 'Packed', hint: 'In a crate that hasn’t shipped', icon: <Container size={15} /> },
  { status: 'shipped', label: 'In transit', hint: 'On its way to Williston', icon: <Truck size={15} /> },
];

const SORTS = ['Bin', 'SKU', 'Site', 'Manufacturer', 'Quantity', 'Unit cost', 'Value'] as const;
type Sort = (typeof SORTS)[number];

const value = (i: InboundItem) => (i.unitCost ?? 0) * i.qty;
const COMPARE: Record<Sort, (a: InboundItem, b: InboundItem) => number> = {
  Bin: (a, b) => a.originSite.localeCompare(b.originSite) || a.originBin.localeCompare(b.originBin) || a.sku.localeCompare(b.sku),
  SKU: (a, b) => a.sku.localeCompare(b.sku),
  Site: (a, b) => a.originSite.localeCompare(b.originSite) || a.sku.localeCompare(b.sku),
  Manufacturer: (a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.sku.localeCompare(b.sku),
  // Bigger first: these are read for what is worth most.
  Quantity: (a, b) => b.qty - a.qty,
  'Unit cost': (a, b) => (b.unitCost ?? -1) - (a.unitCost ?? -1),
  Value: (a, b) => value(b) - value(a),
};

/** Cards drawn per column before "Show more". */
const PAGE = 60;

const usd = (n: number, cents = false) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 });
const uniqueSorted = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const countBy = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});

export function InboundBoard({ origin, onOpenPacking }: { origin: string; onOpenPacking: () => void }) {
  const { data, isLoading } = useInbound();
  const all = useMemo(() => (data ?? []).filter((i) => i.origin === origin && i.status !== 'received'), [data, origin]);
  const [search, setSearch] = useState('');
  const [sites, setSites] = useState<string[]>([]);
  const [bins, setBins] = useState<string[]>([]);
  const [makers, setMakers] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>('Bin');
  const [selected, setSelected] = useState<InboundItem | null>(null);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all
      .filter((i) => (sites.length === 0 || sites.includes(i.originSite)) && (bins.length === 0 || bins.includes(i.originBin)))
      .filter((i) => makers.length === 0 || makers.includes(i.manufacturer))
      .filter(
        (i) => !needle || [i.sku, i.description, i.manufacturer, i.originSite, i.originBin, i.crate].some((v) => v.toLowerCase().includes(needle))
      )
      .sort(COMPARE[sort]);
  }, [all, search, sites, bins, makers, sort]);

  const filtered = !!search.trim() || sites.length + bins.length + makers.length > 0;
  const received = useMemo(() => (data ?? []).filter((i) => i.origin === origin && i.status === 'received'), [data, origin]);
  const onTheRoad = cratesOf(all).filter((c) => c.status === 'shipped');

  if (isLoading) return <div className="py-16 text-center text-textMuted">Loading {origin}…</div>;

  const exportShown = () => {
    const header = ['SKU', 'Description', 'Manufacturer', `${origin} Site`, `${origin} Bin`, 'Qty', 'Avg Unit Cost', 'Value', 'Status', 'Crate', 'Packed', 'Shipped'];
    const label: Record<InboundStatus, string> = { awaiting: 'To pack', packed: 'Packed', shipped: 'In transit', received: 'Received' };
    const lines = [header, ...shown.map((i) => [i.sku, i.description, i.manufacturer, i.originSite, i.originBin, i.qty, i.unitCost, Math.round(value(i) * 100) / 100, label[i.status], i.crate, i.packedAt?.slice(0, 10) ?? '', i.shippedAt?.slice(0, 10) ?? ''])];
    const csv = lines.map((l) => l.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([CSV_BOM, csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${origin.toLowerCase().replace(/\s+/g, '-')}-inbound-${new Date().toISOString().slice(0, 10)}${filtered ? '-filtered' : ''}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <>
      <div className="hidden gap-3 lg:grid lg:grid-cols-4">
        <Card label={`At ${origin}`} value={all.length.toLocaleString()} icon={<Layers size={13} />}>
          {uniqueSorted(all.map((i) => i.sku)).length.toLocaleString()} SKUs across {uniqueSorted(all.map((i) => i.originSite)).length} sites
        </Card>
        <Card label="Units" value={all.reduce((n, i) => n + i.qty, 0).toLocaleString()} icon={<Boxes size={13} />}>
          {shown.length !== all.length ? `${shown.reduce((n, i) => n + i.qty, 0).toLocaleString()} shown` : 'still to reach Williston'}
        </Card>
        <Card label="Value" value={usd(all.reduce((n, i) => n + value(i), 0))} icon={<Coins size={13} />}>
          at average unit cost
        </Card>
        <Card label="Crates on the way" value={onTheRoad.length.toLocaleString()} icon={<Truck size={13} />}>
          {received.length ? `${received.reduce((n, i) => n + (i.receivedQty ?? 0), 0).toLocaleString()} units received so far` : 'none received yet'}
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-2">
        <label className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${origin} SKU, description, manufacturer, bin or crate`}
            className="min-h-[40px] pl-8"
          />
        </label>
        <MultiSelectDropdown icon={<MapPin size={14} />} label="Site" options={uniqueSorted(all.map((i) => i.originSite))} counts={countBy(all.map((i) => i.originSite))} selected={sites} onChange={setSites} />
        <MultiSelectDropdown icon={<Boxes size={14} />} label="Bin" options={uniqueSorted(all.map((i) => i.originBin))} counts={countBy(all.map((i) => i.originBin))} selected={bins} onChange={setBins} />
        <MultiSelectDropdown icon={<Factory size={14} />} label="Manufacturer" options={uniqueSorted(all.map((i) => i.manufacturer))} counts={countBy(all.map((i) => i.manufacturer))} selected={makers} onChange={setMakers} />
        <SelectDropdown options={[...SORTS]} value={sort} valuePrefix="Sort: " onChange={(v) => setSort(v as Sort)} />
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setSites([]);
              setBins([]);
              setMakers([]);
            }}
            className="flex min-h-0 items-center gap-1 rounded-btn px-2 py-2 text-xs font-semibold text-primary hover:bg-surfaceMuted"
          >
            <X size={13} /> Clear
          </button>
        )}
        <button
          type="button"
          onClick={exportShown}
          className="flex min-h-0 items-center gap-1.5 rounded-btn border border-border px-3 py-2 text-xs font-semibold text-textPri hover:bg-surfaceMuted"
          title={`Export what is shown of ${origin}'s stock to a spreadsheet`}
        >
          <Download size={13} /> Export
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
        {COLUMNS.map((c) => (
          <InboundColumn
            key={c.status}
            column={c}
            items={shown.filter((i) => i.status === c.status)}
            total={all.filter((i) => i.status === c.status).length}
            onSelect={setSelected}
            action={
              c.status === 'awaiting' ? (
                <button type="button" onClick={onOpenPacking} className="flex min-h-0 items-center gap-1 rounded-pill border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-textPri hover:bg-surfaceMuted">
                  <PackagePlus size={12} /> Pack several
                </button>
              ) : null
            }
          />
        ))}
      </div>

      {selected && <InboundItemDialog item={selected} all={data ?? []} onClose={() => setSelected(null)} />}
    </>
  );
}

function InboundColumn({
  column,
  items,
  total,
  onSelect,
  action,
}: {
  column: (typeof COLUMNS)[number];
  items: InboundItem[];
  total: number;
  onSelect: (i: InboundItem) => void;
  action: ReactNode;
}) {
  const [limit, setLimit] = useState(PAGE);
  // Below lg the columns stack, so each opens on a tap rather than all three running down
  // the page — the same as Williston's board.
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col overflow-hidden rounded-card bg-columnHeaderBg lg:min-h-0">
      <div className="flex items-center justify-between gap-2 px-3 py-3" title={column.hint}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-h-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-textPri lg:pointer-events-none"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primaryDeep text-white">{column.icon}</span>
          {column.label}
        </button>
        <span className="flex items-center gap-2">
          {action}
          <span className="rounded-pill bg-surface px-2 py-0.5 text-xs font-semibold tabular-nums text-textPri">
            {items.length === total ? total.toLocaleString() : `${items.length.toLocaleString()} of ${total.toLocaleString()}`}
          </span>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? `Close ${column.label}` : `Open ${column.label}`}
            className="flex h-7 w-7 min-h-0 items-center justify-center text-textMuted lg:hidden"
          >
            <ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180')} />
          </button>
        </span>
      </div>
      <div className={cn('space-y-2 overflow-y-auto overscroll-contain px-2 pb-2 lg:block lg:min-h-0 lg:flex-1', !open && 'hidden')}>
        {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-textMuted">Nothing here.</p>}
        {items.slice(0, limit).map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => onSelect(i)}
            className="block w-full rounded-card border border-border bg-surface p-3 text-left hover:border-primary/50"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold text-textPri">{i.sku}</span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-textPri">× {i.qty}</span>
            </span>
            <span className="block truncate text-xs text-textMuted">{i.description || '—'}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-textMuted">
              <span>
                {i.originSite} · Bin <span className="font-semibold text-textPri">{i.originBin || '—'}</span>
              </span>
              {i.unitCost != null && <span>{usd(i.unitCost, true)}/ea</span>}
              {i.crate && (
                <span className="rounded-pill bg-tileBg px-2 py-0.5 font-semibold text-primary">Crate {i.crate}</span>
              )}
            </span>
          </button>
        ))}
        {items.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((n) => n + PAGE)}
            className="block w-full rounded-btn py-2 text-xs font-semibold text-primary hover:bg-surface"
          >
            Show more ({(items.length - limit).toLocaleString()} left)
          </button>
        )}
      </div>
    </section>
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
