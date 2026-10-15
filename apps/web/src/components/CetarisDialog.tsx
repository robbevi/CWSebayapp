import { Check, ClipboardCheck, RotateCcw, Undo2, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { CETARIS_SALE_NUMBER, cetarisDone, cetarisNeeded, cetarisPending, type Sale } from '@warehouse/shared';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useInventoryParts } from '../hooks/useInventoryParts';
import { useListings } from '../hooks/useListings';
import { useClearCetaris, useCompleteCetaris, useLogCetaris, useSales } from '../hooks/useSales';
import { cn } from '../lib/cn';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

const money = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const date = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });

/**
 * Closing out sales in Cetaris. Every eBay sale also needs a Part Sale in Cetaris, in two
 * steps: starting one gives its seven-digit number and leaves it Pending, and it is done
 * once it is completed there.
 *
 * A Part Sale can cover several eBay sales — of several SKUs — so the work here is ticking
 * the sales one Part Sale covered and logging its number once, then completing that Part
 * Sale once, rather than a number and a completion per sale. Oldest first, since that is
 * the order the backlog wants clearing in.
 */
export function CetarisDialog({ onClose, onlySku }: { onClose: () => void; onlySku?: string }) {
  useBodyScrollLock(true);
  const { data: sales = [] } = useSales();
  const { data: parts = [] } = useInventoryParts();
  const { data: listings } = useListings();
  const log = useLogCetaris();
  const clear = useClearCetaris();
  const complete = useCompleteCetaris();

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [number, setNumber] = useState('');
  const [search, setSearch] = useState(onlySku ?? '');

  /**
   * The part a sale was for. By SKU where eBay has one, and otherwise by listing number:
   * sales from before SKUs went on as the Custom Label arrive with no SKU at all.
   */
  const partFor = useMemo(() => {
    const bySku = new Map(parts.map((p) => [p.sku.trim().toUpperCase(), p]));
    const byListing = new Map(parts.filter((p) => p.ebayListingId).map((p) => [p.ebayListingId!, p]));
    return (s: Sale) => (s.sku ? bySku.get(s.sku.trim().toUpperCase()) : undefined) ?? byListing.get(s.ebayListingId);
  }, [parts]);
  const skuOf = (s: Sale) => s.sku || partFor(s)?.sku || `eBay ${s.ebayListingId}`;
  // A sale with no part in SPARE still has its eBay listing, whose title says what it was.
  const titleOf = useMemo(() => new Map((listings ?? []).map((l) => [l.ebayListingId, l.title])), [listings]);
  const describe = (s: Sale) => partFor(s)?.description ?? titleOf.get(s.ebayListingId) ?? '';

  const matches = (s: Sale) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      skuOf(s).toLowerCase().includes(q) ||
      describe(s).toLowerCase().includes(q) ||
      s.orderId.includes(q) ||
      s.ebayListingId.includes(q)
    );
  };
  const awaiting = sales.filter((s) => cetarisNeeded(s) && matches(s)).sort((a, b) => a.soldAt.localeCompare(b.soldAt));
  // Grouped by Part Sale: each is one thing to complete, however many sales it covers. A
  // search shows a Part Sale when any of its sales matches.
  const byNumber = (pick: (s: Sale) => boolean) => {
    const groups = new Map<string, Sale[]>();
    for (const s of sales.filter(pick)) {
      const list = groups.get(s.cetarisSaleNumber!);
      if (list) list.push(s);
      else groups.set(s.cetarisSaleNumber!, [s]);
    }
    return [...groups.entries()].filter(([, list]) => list.some(matches));
  };
  const pending = byNumber(cetarisPending).sort(([, a], [, b]) => (a[0]!.cetarisLoggedAt ?? '').localeCompare(b[0]!.cetarisLoggedAt ?? ''));
  const completed = byNumber(cetarisDone)
    .sort(([, a], [, b]) => (b[0]!.cetarisCompletedAt ?? '').localeCompare(a[0]!.cetarisCompletedAt ?? ''))
    .slice(0, 10);

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allPicked = awaiting.length > 0 && awaiting.every((s) => picked.has(s.lineItemId));
  const valid = CETARIS_SALE_NUMBER.test(number);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !picked.size) return;
    log.mutate(
      { lineItemIds: [...picked], number },
      {
        onSuccess: () => {
          setPicked(new Set());
          setNumber('');
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-card bg-surface">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-surfaceMuted p-4">
          <div>
            <h2 className="flex items-center gap-1.5 text-base font-semibold text-textPri">
              <ClipboardCheck size={16} /> Cetaris Part Sales
            </h2>
            <p className="mt-0.5 text-[11px] text-textMuted">
              Tick the sales one Part Sale covers and log its number. Once it’s completed in Cetaris, complete it here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 min-h-0 items-center justify-center rounded-btn border border-border text-textMuted hover:bg-surface"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <Input
            placeholder="Find by SKU, description or eBay order"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="mt-4 flex items-center justify-between">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-textMuted">
              Need a Part Sale — {awaiting.length}
            </h3>
            {awaiting.length > 0 && (
              <button
                type="button"
                onClick={() => setPicked(allPicked ? new Set() : new Set(awaiting.map((s) => s.lineItemId)))}
                className="min-h-0 text-[11px] font-semibold text-primary hover:underline"
              >
                {allPicked ? 'Untick all' : 'Tick all shown'}
              </button>
            )}
          </div>

          {awaiting.length === 0 && (
            <p className="mt-2 text-xs text-textMuted">Every sale{search ? ' that matches' : ''} has its Part Sale started.</p>
          )}
          <ul className="mt-1">
            {awaiting.map((s) => (
              <li key={s.lineItemId} className="border-b border-border last:border-0">
                <label className="flex cursor-pointer items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    checked={picked.has(s.lineItemId)}
                    onChange={() => toggle(s.lineItemId)}
                    className="h-4 w-4 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-textPri">
                      {skuOf(s)} <span className="font-normal text-textMuted">· {describe(s)}</span>
                    </span>
                    <span className="block text-[11px] text-textMuted">
                      Sold {date(s.soldAt)} · qty {s.qtySold} · order {s.orderId} ·{' '}
                      {s.payoutId ? `payout ${s.payoutId}` : 'payout pending'}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-textPri">{money(s.grossSale)}</span>
                </label>
              </li>
            ))}
          </ul>

          {pending.length > 0 && (
            <>
              <h3 className="mt-5 text-[11px] font-bold uppercase tracking-wide text-textMuted">
                Pending in Cetaris — {pending.length}
              </h3>
              <ul className="mt-1 space-y-2">
                {pending.map(([number, list]) => (
                  <li key={number} className="rounded-card border border-amber-200 bg-amber-50/60 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 text-xs">
                        <span className="font-semibold text-textPri">
                          Part Sale <span className="tabular-nums">{number}</span>
                        </span>
                        <span className="ml-1.5 rounded-pill bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Pending</span>
                        <span className="block text-[11px] text-textMuted">
                          Started {list[0]!.cetarisLoggedAt ? date(list[0]!.cetarisLoggedAt) : '—'}
                          {list[0]!.cetarisLoggedBy && ` by ${list[0]!.cetarisLoggedBy}`} · {list.length} {list.length === 1 ? 'sale' : 'sales'} ·{' '}
                          {money(list.reduce((t, s) => t + s.grossSale, 0))}
                        </span>
                      </span>
                      <Button
                        type="button"
                        onClick={() => complete.mutate({ number })}
                        disabled={complete.isPending}
                        title="Completed in Cetaris: record it as done today"
                      >
                        <Check size={14} /> Complete
                      </Button>
                    </div>
                    <ul className="mt-1.5 border-t border-amber-200/70">
                      {list.map((s) => (
                        <li key={s.lineItemId} className="flex items-center gap-2 py-1 text-[11px]">
                          <span className="min-w-0 flex-1 truncate text-textPri">
                            {skuOf(s)} <span className="text-textMuted">· {describe(s)} · sold {date(s.soldAt)} · qty {s.qtySold}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => clear.mutate(s.lineItemId)}
                            disabled={clear.isPending}
                            title="Take this number back off the sale"
                            className="flex min-h-0 shrink-0 items-center gap-1 rounded-btn border border-border px-1.5 py-0.5 font-semibold text-textMuted hover:bg-surface hover:text-textPri"
                          >
                            <Undo2 size={10} /> Undo
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}

          {completed.length > 0 && (
            <>
              <h3 className="mt-5 text-[11px] font-bold uppercase tracking-wide text-textMuted">Completed recently</h3>
              <ul className="mt-1">
                {completed.map(([number, list]) => (
                  <li key={number} className="flex items-center gap-3 border-b border-border py-2 last:border-0">
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-textPri">
                        Part Sale <span className="font-semibold tabular-nums">{number}</span>{' '}
                        <span className="text-textMuted">· {list.map(skuOf).join(', ')}</span>
                      </span>
                      <span className="block text-[11px] text-textMuted">
                        Completed {list[0]!.cetarisCompletedAt ? date(list[0]!.cetarisCompletedAt) : '—'}
                        {list[0]!.cetarisCompletedBy && ` by ${list[0]!.cetarisCompletedBy}`}
                        {list[0]!.cetarisLoggedAt && ` · started ${date(list[0]!.cetarisLoggedAt)}`}
                        {' · '}
                        {list.every((s) => s.payoutId) ? 'paid out' : 'payout pending'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => complete.mutate({ number, reopen: true })}
                      disabled={complete.isPending}
                      title="Not completed after all: put it back to Pending"
                      className="flex min-h-0 shrink-0 items-center gap-1 rounded-btn border border-border px-2 py-0.5 text-[11px] font-semibold text-textMuted hover:bg-surfaceMuted hover:text-textPri"
                    >
                      <RotateCcw size={11} /> Reopen
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <form onSubmit={submit} className="flex shrink-0 items-center gap-2 border-t border-border p-4">
          <div className="w-40">
            <Input
              inputMode="numeric"
              maxLength={7}
              aria-label="Cetaris Part Sale number"
              placeholder="Part Sale #"
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 7))}
              className={cn('tabular-nums', number && !valid && 'border-amber-400')}
            />
          </div>
          <span className="text-[11px] text-textMuted">
            {number && !valid ? 'Seven digits' : `${picked.size} ${picked.size === 1 ? 'sale' : 'sales'} ticked`}
          </span>
          <Button type="submit" disabled={!valid || !picked.size || log.isPending} className="ml-auto">
            <ClipboardCheck size={14} />
            {log.isPending ? 'Logging…' : `Log for ${picked.size || ''} ${picked.size === 1 ? 'sale' : 'sales'}`.replace('  ', ' ')}
          </Button>
        </form>
      </div>
    </div>
  );
}
