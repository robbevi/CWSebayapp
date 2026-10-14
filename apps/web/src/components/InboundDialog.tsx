import { useMemo, useState, type ReactNode } from 'react';
import { Container, PackageCheck, PackagePlus, Truck, Upload, X } from 'lucide-react';
import {
  cratesOf,
  INBOUND_ORIGINS,
  nextCrateLabel,
  normalizeCrate,
  type Crate,
  type InboundItem,
} from '@warehouse/shared';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import {
  useImportInbound,
  useInbound,
  usePackInbound,
  useReceiveCrate,
  useShipCrate,
  useUnpackInbound,
} from '../hooks/useInbound';
import { useInventoryParts } from '../hooks/useInventoryParts';
import { cn } from '../lib/cn';
import { useUIStore } from '../state/useUIStore';
import { useUserStore } from '../state/useUserStore';
import { Input } from './ui/Input';

type Tab = 'pack' | 'crates' | 'transit' | 'received';

/** Rows drawn at once in the packing list; a search narrows the rest. */
const SHOWN = 150;

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
const money = (n: number | null) => (n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

const BUTTON =
  'flex min-h-0 items-center justify-center gap-1.5 rounded-btn px-3 py-2 text-xs font-semibold disabled:opacity-50';
const PRIMARY = `${BUTTON} bg-primary text-white hover:bg-primaryHover`;
const SECONDARY = `${BUTTON} border border-border text-textPri hover:bg-surfaceMuted`;

/**
 * Stock on its way to Williston from another district. The origin's team packs parts into
 * crates and ships them; Williston receives each crate, completing the Cetaris transfer and
 * putting every part in a Williston bin, at which point it is ordinary Williston stock.
 */
export function InboundDialog({ onClose }: { onClose: () => void }) {
  useBodyScrollLock(true);
  const session = useUserStore((s) => s.session);
  const { data: items = [], isLoading } = useInbound();
  const crates = useMemo(() => cratesOf(items), [items]);
  const awaiting = useMemo(() => items.filter((i) => i.status === 'awaiting'), [items]);
  const open = crates.filter((c) => c.status === 'packed');
  const transit = crates.filter((c) => c.status === 'shipped');
  const received = crates.filter((c) => c.status === 'received');

  // The origin's team starts where their work is; Williston starts on what is arriving.
  const start = useUIStore((s) => s.inboundStart);
  const [tab, setTab] = useState<Tab>(() => start ?? (session?.district ? 'pack' : transit.length ? 'transit' : 'pack'));
  const [importing, setImporting] = useState(false);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'pack', label: 'To pack', count: awaiting.length },
    { key: 'crates', label: 'Open crates', count: open.length },
    { key: 'transit', label: 'In transit', count: transit.length },
    { key: 'received', label: 'Received', count: received.length },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-6">
      <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden bg-surface sm:h-[90vh] sm:rounded-card">
        <div className="shrink-0 border-b border-border bg-surfaceMuted p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-1.5 text-base font-semibold text-textPri">
                <Container size={16} /> Inbound to Williston
              </h2>
              <p className="mt-0.5 text-[11px] text-textMuted">
                Packed into crates and shipped by the district sending it; received here into a Williston bin.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {session?.admin && (
                <button type="button" onClick={() => setImporting((v) => !v)} className={SECONDARY}>
                  <Upload size={13} /> Import
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-9 w-9 min-h-0 items-center justify-center rounded-btn border border-border text-textMuted hover:bg-surface"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          {importing && <ImportForm onDone={() => setImporting(false)} />}
          <div className="mt-3 flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex min-h-0 shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold',
                  tab === t.key ? 'bg-primary text-white' : 'text-textMuted hover:bg-surface'
                )}
              >
                {t.label}
                <span className={cn('rounded-pill px-1.5 text-[10px] tabular-nums', tab === t.key ? 'bg-white/20' : 'bg-surface')}>
                  {t.count.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {isLoading ? (
            <p className="p-4 text-xs text-textMuted">Loading…</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-xs text-textMuted">
              Nothing is on its way yet.{session?.admin ? ' Import a district’s PROFIT eBay pool export to begin.' : ''}
            </p>
          ) : tab === 'pack' ? (
            <PackList awaiting={awaiting} items={items} openCrates={open} onPacked={() => setTab('crates')} />
          ) : tab === 'crates' ? (
            <CrateList crates={open} empty="No crates are being packed." render={(c) => <OpenCrate crate={c} />} />
          ) : tab === 'transit' ? (
            <CrateList crates={transit} empty="Nothing is in transit." render={(c) => <ArrivingCrate crate={c} />} />
          ) : (
            <CrateList crates={received} empty="No crates received yet." render={(c) => <ReceivedCrate crate={c} />} />
          )}
        </div>
      </div>
    </div>
  );
}

function ImportForm({ onDone }: { onDone: () => void }) {
  const [origin, setOrigin] = useState(INBOUND_ORIGINS[0]!);
  const [file, setFile] = useState<File | null>(null);
  const run = useImportInbound();
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-card border border-border bg-surface p-3">
      <label className="text-[11px] font-semibold text-textMuted">
        Coming from
        <select
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          className="mt-1 block min-h-[36px] rounded-btn border border-border bg-surface px-2 text-xs text-textPri"
        >
          {INBOUND_ORIGINS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
      <label className="min-w-0 flex-1 text-[11px] font-semibold text-textMuted">
        PROFIT eBay pool export (.csv)
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-xs text-textPri"
        />
      </label>
      <button
        type="button"
        disabled={!file || run.isPending}
        onClick={() => file && run.mutate({ file, origin }, { onSuccess: onDone })}
        className={PRIMARY}
      >
        {run.isPending ? 'Importing…' : 'Import'}
      </button>
      <p className="w-full text-[11px] text-textMuted">
        Rows already imported are skipped, so the same file can be brought in again safely. Value is divided by quantity
        into an average cost per unit.
      </p>
    </div>
  );
}

/** Everything waiting at the origin, by site and bin, ready to be picked into a crate. */
function PackList({
  awaiting,
  items,
  openCrates,
  onPacked,
}: {
  awaiting: InboundItem[];
  items: InboundItem[];
  openCrates: Crate[];
  onPacked: () => void;
}) {
  const [search, setSearch] = useState('');
  const [site, setSite] = useState('');
  const [chosen, setChosen] = useState<Map<string, number>>(new Map());
  const origin = awaiting[0]?.origin ?? openCrates[0]?.origin ?? '';
  const [crate, setCrate] = useState(() => openCrates[0]?.label ?? nextCrateLabel(items, origin));
  const pack = usePackInbound();

  const sites = useMemo(() => [...new Set(awaiting.map((i) => i.originSite))].sort(), [awaiting]);
  const matching = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return awaiting
      .filter((i) => !site || i.originSite === site)
      .filter(
        (i) =>
          !needle ||
          [i.sku, i.description, i.manufacturer, i.originBin, i.originSite].some((v) => v.toLowerCase().includes(needle))
      )
      .sort((a, b) => a.originSite.localeCompare(b.originSite) || a.originBin.localeCompare(b.originBin) || a.sku.localeCompare(b.sku));
  }, [awaiting, search, site]);

  const toggle = (i: InboundItem) =>
    setChosen((m) => {
      const next = new Map(m);
      if (next.has(i.id)) next.delete(i.id);
      else next.set(i.id, i.qty);
      return next;
    });
  const units = [...chosen.values()].reduce((n, q) => n + q, 0);
  const byId = useMemo(() => new Map(awaiting.map((i) => [i.id, i])), [awaiting]);

  const submit = () =>
    pack.mutate(
      {
        crate,
        items: [...chosen.entries()].map(([id, qty]) => (qty === byId.get(id)?.qty ? { id } : { id, qty })),
      },
      {
        onSuccess: () => {
          setChosen(new Map());
          onPacked();
        },
      }
    );

  if (awaiting.length === 0) return <p className="p-4 text-xs text-textMuted">Everything has been packed.</p>;

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex flex-wrap gap-2 border-b border-border bg-surface p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search SKU, description, manufacturer or bin"
          className="min-h-[36px] flex-1"
        />
        {sites.length > 1 && (
          <select
            value={site}
            onChange={(e) => setSite(e.target.value)}
            className="min-h-[36px] rounded-btn border border-border bg-surface px-2 text-xs text-textPri"
            aria-label="Site"
          >
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )}
      </div>

      <ul className="flex-1 divide-y divide-border">
        {matching.slice(0, SHOWN).map((i) => {
          const qty = chosen.get(i.id);
          return (
            <li key={i.id} className={cn('flex items-center gap-3 px-3 py-2', qty !== undefined && 'bg-tileBg')}>
              <input
                type="checkbox"
                checked={qty !== undefined}
                onChange={() => toggle(i)}
                aria-label={`Pack ${i.sku}`}
                className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
              />
              <button type="button" onClick={() => toggle(i)} className="min-w-0 flex-1 text-left text-xs">
                <span className="block font-semibold text-textPri">{i.sku}</span>
                <span className="block truncate text-textMuted">{i.description}</span>
              </button>
              <span className="hidden w-28 shrink-0 text-[11px] text-textMuted sm:block">
                {i.originSite}
                <br />
                Bin <span className="font-semibold text-textPri">{i.originBin || '—'}</span>
              </span>
              <span className="hidden w-16 shrink-0 text-right text-[11px] text-textMuted sm:block">{money(i.unitCost)}/ea</span>
              {qty !== undefined ? (
                <span className="flex w-24 shrink-0 items-center justify-end gap-1 text-[11px] text-textMuted">
                  <input
                    type="number"
                    min={1}
                    max={i.qty}
                    value={qty}
                    onChange={(e) =>
                      setChosen((m) => new Map(m).set(i.id, Math.min(i.qty, Math.max(1, Math.trunc(Number(e.target.value)) || 1))))
                    }
                    aria-label={`How many of ${i.sku} to pack`}
                    className="w-14 rounded-btn border border-border bg-surface px-1.5 py-1 text-right text-xs text-textPri"
                  />
                  of {i.qty}
                </span>
              ) : (
                <span className="w-24 shrink-0 text-right text-xs font-semibold text-textPri">× {i.qty}</span>
              )}
            </li>
          );
        })}
      </ul>
      {matching.length > SHOWN && (
        <p className="px-3 py-2 text-[11px] text-textMuted">
          Showing {SHOWN} of {matching.length.toLocaleString()}. Search or pick a site to narrow the list.
        </p>
      )}
      {matching.length === 0 && <p className="p-4 text-xs text-textMuted">Nothing matches.</p>}

      {chosen.size > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-border bg-surfaceMuted p-3">
          <span className="text-xs font-semibold text-textPri">
            {plural(chosen.size, 'part')} · {plural(units, 'unit')}
          </span>
          <span className="flex-1" />
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-textMuted">
            Crate
            <input
              list="open-crates"
              value={crate}
              onChange={(e) => setCrate(e.target.value)}
              className="w-28 rounded-btn border border-border bg-surface px-2 py-1.5 text-xs font-semibold uppercase text-textPri"
            />
            <datalist id="open-crates">
              {openCrates.map((c) => (
                <option key={c.label} value={c.label} />
              ))}
              <option value={nextCrateLabel(items, origin)} />
            </datalist>
          </label>
          <button type="button" disabled={!normalizeCrate(crate) || pack.isPending} onClick={submit} className={PRIMARY}>
            <PackagePlus size={13} /> {pack.isPending ? 'Packing…' : 'Pack into crate'}
          </button>
        </div>
      )}
    </div>
  );
}

function CrateList({ crates, empty, render }: { crates: Crate[]; empty: string; render: (c: Crate) => ReactNode }) {
  if (crates.length === 0) return <p className="p-4 text-xs text-textMuted">{empty}</p>;
  return (
    <div className="space-y-3 p-3">
      {crates.map((c) => (
        <section key={c.label} className="rounded-card border border-border">
          {render(c)}
        </section>
      ))}
    </div>
  );
}

function CrateHeading({ crate, detail }: { crate: Crate; detail: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-surfaceMuted px-3 py-2">
      <span className="text-sm font-semibold text-textPri">
        Crate {crate.label} <span className="font-normal text-textMuted">· from {crate.origin}</span>
      </span>
      <span className="text-[11px] text-textMuted">
        {plural(crate.items.length, 'part')} · {plural(crate.units, 'unit')} · {detail}
      </span>
    </div>
  );
}

function ItemLine({ item, children }: { item: InboundItem; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-xs">
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-textPri">
          {item.qty} × {item.sku}
        </span>
        <span className="block truncate text-textMuted">{item.description}</span>
      </span>
      <span className="hidden w-28 shrink-0 text-[11px] text-textMuted sm:block">
        from {item.originSite} {item.originBin}
      </span>
      {children}
    </li>
  );
}

/** A crate still being filled: take things out, or send it. */
function OpenCrate({ crate }: { crate: Crate }) {
  const unpack = useUnpackInbound();
  const ship = useShipCrate();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <CrateHeading crate={crate} detail={`packing since ${day(crate.packedAt)}`} />
      <ul className="divide-y divide-border">
        {crate.items.map((i) => (
          <ItemLine key={i.id} item={i}>
            <button type="button" disabled={unpack.isPending} onClick={() => unpack.mutate([i.id])} className={SECONDARY}>
              Take out
            </button>
          </ItemLine>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-2 border-t border-border p-3">
        {confirming ? (
          <>
            <span className="text-[11px] text-textMuted">Closed and on its way to Williston?</span>
            <button type="button" onClick={() => setConfirming(false)} className={SECONDARY}>
              Not yet
            </button>
            <button type="button" disabled={ship.isPending} onClick={() => ship.mutate(crate.label)} className={PRIMARY}>
              <Truck size={13} /> Yes, shipped
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={PRIMARY}>
            <Truck size={13} /> Mark shipped
          </button>
        )}
      </div>
    </>
  );
}

/** A crate on its way: Williston opens it here and puts each part in a bin. */
function ArrivingCrate({ crate }: { crate: Crate }) {
  const [receiving, setReceiving] = useState(false);
  return (
    <>
      <CrateHeading crate={crate} detail={`shipped ${day(crate.shippedAt)}${crate.shippedBy ? ` by ${crate.shippedBy}` : ''}`} />
      {receiving ? (
        <ReceiveForm crate={crate} onCancel={() => setReceiving(false)} />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {crate.items.map((i) => (
              <ItemLine key={i.id} item={i} />
            ))}
          </ul>
          <div className="flex justify-end border-t border-border p-3">
            <button type="button" onClick={() => setReceiving(true)} className={PRIMARY}>
              <PackageCheck size={13} /> Receive crate
            </button>
          </div>
        </>
      )}
    </>
  );
}

interface Line {
  receivedQty: number;
  binLocation: string;
  newBinLocation: string;
}

function ReceiveForm({ crate, onCancel }: { crate: Crate; onCancel: () => void }) {
  const { data: parts } = useInventoryParts();
  // Williston's own sites, most used first, so the usual one is the default.
  const sites = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of parts ?? []) if (p.inventorySite && !p.origin) count.set(p.inventorySite, (count.get(p.inventorySite) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  }, [parts]);
  const [site, setSite] = useState('');
  const [transferId, setTransferId] = useState('');
  const [allBin, setAllBin] = useState('');
  const [lines, setLines] = useState<Record<string, Line>>(() =>
    Object.fromEntries(crate.items.map((i) => [i.id, { receivedQty: i.qty, binLocation: '', newBinLocation: '' }]))
  );
  const receive = useReceiveCrate();
  const chosenSite = site || sites[0] || '';

  const set = (id: string, patch: Partial<Line>) => setLines((l) => ({ ...l, [id]: { ...l[id]!, ...patch } }));
  const missingBin = crate.items.filter((i) => lines[i.id]!.receivedQty > 0 && !lines[i.id]!.binLocation.trim());
  const ready = !!transferId.trim() && !!chosenSite && missingBin.length === 0;

  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap gap-2">
        <label className="text-[11px] font-semibold text-textMuted">
          Cetaris transfer #
          <Input value={transferId} onChange={(e) => setTransferId(e.target.value)} className="mt-1 min-h-[36px] w-40" />
        </label>
        <label className="text-[11px] font-semibold text-textMuted">
          Williston site
          <select
            value={chosenSite}
            onChange={(e) => setSite(e.target.value)}
            className="mt-1 block min-h-[36px] rounded-btn border border-border bg-surface px-2 text-xs text-textPri"
          >
            {sites.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-textMuted">
          One bin for everything
          <span className="mt-1 flex gap-1">
            <Input value={allBin} onChange={(e) => setAllBin(e.target.value)} className="min-h-[36px] w-28" />
            <button
              type="button"
              disabled={!allBin.trim()}
              onClick={() =>
                setLines((l) => Object.fromEntries(Object.entries(l).map(([id, v]) => [id, { ...v, binLocation: allBin.trim() }])))
              }
              className={SECONDARY}
            >
              Fill
            </button>
          </span>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-textMuted">
              <th className="py-1 pr-2">Part</th>
              <th className="w-16 py-1 pr-2 text-right">Sent</th>
              <th className="w-20 py-1 pr-2">Arrived</th>
              <th className="w-28 py-1 pr-2">Bin</th>
              <th className="w-28 py-1">Recovery bin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {crate.items.map((i) => {
              const line = lines[i.id]!;
              return (
                <tr key={i.id}>
                  <td className="py-1.5 pr-2">
                    <span className="block font-semibold text-textPri">{i.sku}</span>
                    <span className="block max-w-[260px] truncate text-textMuted">{i.description}</span>
                  </td>
                  <td className="py-1.5 pr-2 text-right font-semibold text-textPri">{i.qty}</td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="number"
                      min={0}
                      value={line.receivedQty}
                      onChange={(e) => set(i.id, { receivedQty: Math.max(0, Math.trunc(Number(e.target.value)) || 0) })}
                      aria-label={`How many of ${i.sku} arrived`}
                      className={cn(
                        'w-16 rounded-btn border bg-surface px-1.5 py-1 text-right text-xs text-textPri',
                        line.receivedQty !== i.qty ? 'border-amber-500' : 'border-border'
                      )}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      value={line.binLocation}
                      onChange={(e) => set(i.id, { binLocation: e.target.value })}
                      aria-label={`Bin for ${i.sku}`}
                      className="w-24 rounded-btn border border-border bg-surface px-1.5 py-1 text-xs uppercase text-textPri"
                    />
                  </td>
                  <td className="py-1.5">
                    <input
                      value={line.newBinLocation}
                      onChange={(e) => set(i.id, { newBinLocation: e.target.value })}
                      aria-label={`Recovery bin for ${i.sku}`}
                      className="w-24 rounded-btn border border-border bg-surface px-1.5 py-1 text-xs uppercase text-textPri"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {missingBin.length > 0 && (
          <span className="text-[11px] text-textMuted">{plural(missingBin.length, 'part')} still need a bin.</span>
        )}
        <button type="button" onClick={onCancel} className={SECONDARY}>
          Cancel
        </button>
        <button
          type="button"
          disabled={!ready || receive.isPending}
          onClick={() =>
            receive.mutate({
              crate: crate.label,
              transferId: transferId.trim(),
              site: chosenSite,
              items: crate.items.map((i) => ({
                id: i.id,
                receivedQty: lines[i.id]!.receivedQty,
                binLocation: lines[i.id]!.binLocation.trim().toUpperCase(),
                newBinLocation: lines[i.id]!.newBinLocation.trim().toUpperCase(),
              })),
            })
          }
          className={PRIMARY}
        >
          <PackageCheck size={13} /> {receive.isPending ? 'Receiving…' : 'Receive into Williston'}
        </button>
      </div>
    </div>
  );
}

function ReceivedCrate({ crate }: { crate: Crate }) {
  const [open, setOpen] = useState(false);
  const short = crate.items.filter((i) => (i.receivedQty ?? i.qty) !== i.qty);
  return (
    <>
      <button type="button" onClick={() => setOpen((v) => !v)} className="block w-full text-left">
        <CrateHeading
          crate={crate}
          detail={`received ${day(crate.receivedAt)}${crate.receivedBy ? ` by ${crate.receivedBy}` : ''} · transfer ${crate.transferId || '—'}${
            short.length ? ` · ${short.length} counted differently` : ''
          }`}
        />
      </button>
      {open && (
        <ul className="divide-y divide-border">
          {crate.items.map((i) => (
            <ItemLine key={i.id} item={i}>
              <span className={cn('shrink-0 text-[11px]', i.receivedQty !== i.qty ? 'font-semibold text-amber-600' : 'text-textMuted')}>
                {i.receivedQty ?? 0} arrived
              </span>
            </ItemLine>
          ))}
        </ul>
      )}
    </>
  );
}
