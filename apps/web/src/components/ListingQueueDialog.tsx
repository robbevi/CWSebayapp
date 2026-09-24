import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Check, Eye, X } from 'lucide-react';
import { useState } from 'react';
import { useUIStore } from '../state/useUIStore';
import { listingProblems, type AgentListing, type CategorySuggestion } from '@warehouse/shared';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import {
  fetchCategorySuggestions,
  fetchQueuePlan,
  fetchQueueStatus,
  scheduleQueue,
  type PlannedListing,
  type QueuePlan,
} from '../lib/api';
import { cn } from '../lib/cn';
import { useToastStore } from '../state/useToastStore';
import { Button } from './ui/Button';
import { SelectDropdown } from './ui/SelectDropdown';

/** A planned listing, plus whether what is shown came from an edit made on the part. */
type Row = PlannedListing & { edited?: boolean };

/** A listing someone has been editing on the part itself, saved by the browser it was edited in. */
function savedDraft(sku: string): { listing?: { title?: string; price?: number | null } } | null {
  try {
    const raw = localStorage.getItem(`spare.listing.${sku}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const money = (v: number | null) => (v == null ? '—' : v.toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
const day = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const HOURS = Array.from({ length: 24 }, (_, h) =>
  new Date(2026, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' })
);

/** What SPARE should reach for first when filling a batch. */
const FOCUS = {
  'Revenue priority': 'priority',
  'Highest value first': 'value',
  'Longest waiting': 'oldest',
  'Quickest wins': 'quick',
} as const;
type FocusKey = (typeof FOCUS)[keyof typeof FOCUS];

/** Ordering happens here rather than on the server, so changing it costs no round trip. */
function focusSort(items: PlannedListing[], focus: FocusKey): PlannedListing[] {
  const value = (i: PlannedListing) => (i.price ?? 0) * i.quantity;
  if (focus === 'value') return [...items].sort((a, b) => value(b) - value(a));
  if (focus === 'quick') return [...items].sort((a, b) => b.photos - a.photos || (b.price ?? 0) - (a.price ?? 0));
  if (focus === 'oldest') return items;
  return items;
}

/** One listing's category, fixed in place when eBay's match was too uncertain to pick. */
function CategoryFix({ item, onPick }: { item: PlannedListing; onPick: (s: CategorySuggestion) => void }) {
  const [open, setOpen] = useState(false);
  const suggestions = useQuery({
    queryKey: ['queue-category', item.partId, item.listing.title],
    queryFn: () => fetchCategorySuggestions(item.listing.titleOptions[0] ?? item.listing.title, item.listing.categoryPath ?? ''),
    enabled: open,
  });

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="min-h-0 rounded-btn border border-border px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-surfaceMuted"
      >
        {open ? 'Hide categories' : 'Choose a category'}
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          {suggestions.isLoading && <p className="text-[11px] text-textMuted">Asking eBay…</p>}
          {suggestions.data?.length === 0 && (
            <p className="text-[11px] text-textMuted">eBay suggested nothing for this title.</p>
          )}
          {suggestions.data?.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                onPick(s);
                setOpen(false);
              }}
              className="block w-full rounded-btn border border-border px-2 py-1 text-left text-[11px] hover:bg-surfaceMuted"
            >
              <span className="font-semibold text-textPri">{s.name}</span>
              <span className="text-textMuted"> · {s.id}</span>
              <span className="block text-textMuted">{s.path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A week of listings in one sitting: SPARE proposes the parts, day by day, and nothing is
 * sent until an admin approves the batch. eBay then holds each listing until its start
 * time, so SPARE has no part to play once the batch is away.
 *
 * Policies are decided per listing rather than once for the batch: returns follow the
 * category, since Motors buyers expect them and industrial buyers do not, and postage
 * follows the agent's weight. Both can be changed on any row before it goes.
 */
export function ListingQueueDialog({ onClose }: { onClose: () => void }) {
  useBodyScrollLock(true);
  const toast = useToastStore((s) => s.show);
  const qc = useQueryClient();

  const [days, setDays] = useState(7);
  const [perDay, setPerDay] = useState(10);
  const [hour, setHour] = useState(9);
  const [focus, setFocus] = useState<FocusKey>('priority');
  // Empty means the first day eBay would accept, which is today when the hour is still
  // far enough off and tomorrow when it isn't.
  const [startDate, setStartDate] = useState('');
  // Set, the batch goes at the first moment eBay will take it, and the day and hour above
  // stop mattering.
  const [asap, setAsap] = useState(false);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  // Changes the reviewer has made to a row, kept apart from what the server proposed.
  const [edits, setEdits] = useState<Record<string, Partial<PlannedListing>>>({});
  const setUI = useUIStore((s) => s.set);

  const plan = useQuery<QueuePlan>({
    queryKey: ['listing-queue-plan', days, perDay, hour, startDate, asap],
    queryFn: () => fetchQueuePlan(days, perDay, hour, startDate || undefined, asap),
  });
  const status = useQuery({
    queryKey: ['listing-queue-status'],
    queryFn: fetchQueueStatus,
    refetchInterval: (q) => (q.state.data?.running ? 4000 : false),
  });

  const options = plan.data?.policyOptions;
  const edit = (partId: string, patch: Partial<PlannedListing>) =>
    setEdits((e) => ({ ...e, [partId]: { ...e[partId], ...patch } }));

  /** Switching postage swaps the shipping policy and leaves returns and payment alone. */
  const setShipping = (item: PlannedListing, shipping: 'free' | 'paid') => {
    const policy = shipping === 'free' ? options?.freeShipping : options?.paidShipping;
    edit(item.partId, { shipping, policies: { ...item.policies, shipping: policy?.id ?? item.policies.shipping } });
  };

  const setCategory = (item: PlannedListing, s: CategorySuggestion) => {
    const listing: AgentListing = { ...item.listing, categoryId: s.id, categoryName: s.name };
    const motors = s.siteId === '100';
    const returns = motors ? options?.motorsReturns : options?.noReturns;
    edit(item.partId, {
      listing,
      categoryId: s.id,
      categoryName: s.name,
      categoryUncertain: false,
      motors,
      problems: listingProblems(listing),
      policies: { ...item.policies, returns: returns?.id ?? item.policies.returns },
    });
  };

  // A price or title changed on the part wins over what was researched: it is the later
  // decision, and the person who made it expects to see it here.
  const withDrafts = (i: Row): Row => {
    const draft = savedDraft(i.sku)?.listing;
    if (!draft) return i;
    return {
      ...i,
      title: draft.title?.trim() || i.title,
      price: draft.price ?? i.price,
      edited: !!draft.title?.trim() || draft.price != null,
    };
  };

  const items = focusSort(plan.data?.items ?? [], focus)
    .map((i) => ({ ...withDrafts(i), ...edits[i.partId] }) as Row)
    .filter((i) => !dropped.has(i.partId));
  const ready = items.filter((i) => i.problems.length === 0);

  // Re-dated after ordering, so the days read in the order the batch will actually go out.
  const planned = ready.map((item, index) => {
    const source = plan.data!.items[index];
    return { ...item, startAt: source ? source.startAt : item.startAt };
  });

  const schedule = useMutation({
    mutationFn: () =>
      scheduleQueue(
        planned.map((i) => ({
          partId: i.partId,
          startAt: i.startAt,
          policies: i.policies,
          categoryId: i.categoryId || undefined,
          price: i.price ?? undefined,
          title: i.title,
        }))
      ),
    onSuccess: () => {
      toast(`Scheduling ${planned.length} listings. eBay holds each until its day.`);
      void qc.invalidateQueries({ queryKey: ['listing-queue-status'] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not schedule the batch', 'error'),
  });

  const running = status.data?.running;
  const byDay = new Map<string, Row[]>();
  for (const item of planned) {
    const key = day(item.startAt);
    byDay.set(key, [...(byDay.get(key) ?? []), item]);
  }
  const blocked = items.filter((i) => i.problems.length > 0);
  const unsure = planned.filter((i) => i.categoryUncertain);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-card bg-surface">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-surfaceMuted p-4">
          <div>
            <h2 className="flex items-center gap-1.5 text-base font-semibold text-textPri">
              <CalendarClock size={16} /> Schedule a batch
            </h2>
            <p className="mt-0.5 text-[11px] text-textMuted">
              Nothing is sent until you approve. Returns follow the category; postage follows the weight.
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div>
              <div className="mb-1 text-[11px] font-semibold text-textMuted">Starting</div>
              <input
                type="date"
                aria-label="First day of the batch"
                value={startDate}
                min={new Date().toISOString().slice(0, 10)}
                disabled={asap}
                onChange={(e) => {
                  setAsap(false);
                  setStartDate(e.target.value);
                }}
                className="h-11 w-full rounded-btn border border-border bg-surface px-2 text-xs text-textPri disabled:opacity-50"
              />
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold text-textMuted">Listings a day</div>
              <SelectDropdown
                options={['5', '10', '15', '20']}
                value={String(perDay)}
                onChange={(v) => setPerDay(Number(v))}
              />
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold text-textMuted">Days</div>
              <SelectDropdown
                options={['1', '3', '7', '14', '21']}
                value={String(days)}
                onChange={(v) => setDays(Number(v))}
              />
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold text-textMuted">Each day at</div>
              <SelectDropdown options={HOURS} value={HOURS[hour]} onChange={(v) => setHour(HOURS.indexOf(v))} />
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold text-textMuted">List first</div>
              <SelectDropdown
                options={Object.keys(FOCUS)}
                value={Object.keys(FOCUS).find((k) => FOCUS[k as keyof typeof FOCUS] === focus) ?? 'Revenue priority'}
                onChange={(v) => setFocus(FOCUS[v as keyof typeof FOCUS])}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setAsap((v) => !v);
              setStartDate('');
            }}
            aria-pressed={asap}
            className={cn(
              'mt-2 min-h-0 rounded-pill border px-3 py-1 text-[11px] font-semibold',
              asap ? 'border-primary bg-primary/10 text-primary' : 'border-border text-textMuted hover:bg-surfaceMuted'
            )}
          >
            {asap ? 'Listing as soon as eBay allows' : 'List today, as soon as eBay allows'}
          </button>

          {plan.data && (
            <p className="mt-2 text-[11px] text-textMuted">
              First listing {new Date(plan.data.startsOn).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}
              {!asap && startDate && plan.data.startsOn.slice(0, 10) !== startDate && ' — eBay needs an hour of notice'}
              {asap && ' — the soonest eBay accepts'}.
              {options?.payment && ` Paid through ${options.payment.name}.`}
            </p>
          )}

          {plan.isFetching && <p className="mt-4 text-xs text-textMuted">Working out what to list…</p>}
          {plan.error && <p className="mt-4 text-xs text-red-600">{plan.error.message}</p>}

          {plan.data && !plan.isFetching && (
            <>
              <p className="mt-4 text-[11px] text-textMuted">
                {planned.length} to schedule
                {unsure.length > 0 && `, ${unsure.length} with a guessed category`}
                {blocked.length > 0 && `, ${blocked.length} needing a fix`}
                {plan.data.remaining > 0 && `, ${plan.data.remaining} more ready for another batch`}
                {plan.data.unresearched > 0 && `, ${plan.data.unresearched} waiting on research`}.
              </p>

              {[...byDay.entries()].map(([label, dayItems]) => (
                <section key={label} className="mt-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-textMuted">
                    {label} — {dayItems.length} {dayItems.length === 1 ? 'listing' : 'listings'}
                  </h3>
                  <ul className="mt-1">
                    {dayItems.map((item) => (
                      <li key={item.partId} className="border-b border-border py-2 last:border-0">
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => setUI({ selectedId: item.partId, modalOpen: true })}
                            title="Open the part"
                            className="min-h-0 min-w-0 flex-1 text-left hover:underline"
                          >
                            <div className="truncate text-xs font-semibold text-textPri">{item.title}</div>
                            <div className="mt-0.5 text-[11px] text-textMuted">
                              {item.sku} · {item.condition} · qty {item.quantity} · {item.photos} photos ·{' '}
                              {time(item.startAt)}
                            </div>
                          </button>
                          <div className="shrink-0 text-right text-xs font-bold tabular-nums text-textPri">
                            {money(item.price)}
                          </div>
                          <button
                            type="button"
                            onClick={() => setDropped(new Set(dropped).add(item.partId))}
                            className="min-h-0 shrink-0 rounded-btn p-1 text-textMuted hover:bg-surfaceMuted hover:text-textPri"
                            title="Leave this one out of the batch"
                            aria-label={`Leave ${item.sku} out`}
                          >
                            <X size={14} />
                          </button>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="rounded-pill border border-border px-2 py-0.5 text-textMuted">
                            {item.categoryName ?? item.categoryId}
                          </span>
                          <span className="rounded-pill border border-border px-2 py-0.5 text-textMuted">
                            {item.motors ? 'Returns accepted' : 'No returns'}
                          </span>
                          {item.edited && (
                            <span className="rounded-pill border border-primary/30 bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                              Your edit
                            </span>
                          )}
                          {item.categoryUncertain && (
                            <span className="flex items-center gap-1 rounded-pill border border-sky-200 bg-sky-50 px-2 py-0.5 font-semibold text-sky-700">
                              <Eye size={10} /> Category review suggested
                            </span>
                          )}
                          {(['free', 'paid'] as const).map((choice) => (
                            <button
                              key={choice}
                              type="button"
                              onClick={() => setShipping(item, choice)}
                              className={cn(
                                'min-h-0 rounded-pill border px-2 py-0.5 font-semibold',
                                item.shipping === choice
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-border text-textMuted hover:bg-surfaceMuted'
                              )}
                            >
                              {choice === 'free' ? 'Free shipping' : 'Buyer pays'}
                            </button>
                          ))}
                        </div>

                        {item.categoryUncertain && item.categoryAlternatives.length > 1 && (
                          <div className="mt-1.5 max-w-xs">
                            <SelectDropdown
                              options={item.categoryAlternatives.map((s) => s.name)}
                              value={item.categoryAlternatives.find((s) => s.id === item.categoryId)?.name ?? ''}
                              placeholder="Change the category"
                              onChange={(name) => {
                                const picked = item.categoryAlternatives.find((s) => s.name === name);
                                if (picked) setCategory(item, picked);
                              }}
                            />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              {blocked.length > 0 && (
                <section className="mt-5">
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-amber-600">
                    Needs a fix before it can go
                  </h3>
                  <ul className="mt-1">
                    {blocked.map((item) => (
                      <li key={item.partId} className="border-b border-border py-2 last:border-0">
                        <div className="text-xs font-semibold text-textPri">{item.title}</div>
                        <div className="text-[11px] text-textMuted">
                          {item.sku} · {money(item.price)}
                        </div>
                        <div className="mt-1 flex items-start gap-1 text-[11px] font-semibold text-amber-600">
                          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                          {item.problems.join(' ')}
                        </div>
                        <CategoryFix item={item} onPick={(s) => setCategory(item, s)} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {status.data && (status.data.running || status.data.startedAt) && (
            <div className="mt-4 rounded-btn border border-border bg-surfaceMuted p-2.5 text-[11px] text-textMuted">
              {status.data.running
                ? `Scheduling — ${status.data.scheduled} of ${status.data.total} done.`
                : `Last batch: ${status.data.scheduled} of ${status.data.total} scheduled.`}
              {status.data.failed.length > 0 && (
                <ul className="mt-1">
                  {status.data.failed.slice(-4).map((f) => (
                    <li key={f.sku} className="text-amber-600">
                      {f.sku}: {f.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-border p-4">
          <span className="text-[11px] text-textMuted">
            {planned.length} will be scheduled
            {blocked.length > 0 && ` — ${blocked.length} still needs a category or a price`}
          </span>
          <Button
            type="button"
            onClick={() => schedule.mutate()}
            disabled={!planned.length || schedule.isPending || running}
            className="ml-auto"
          >
            <Check size={14} />
            {schedule.isPending || running ? 'Scheduling…' : `Schedule ${planned.length}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
