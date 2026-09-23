import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PolicyChoice, SellerPolicy } from '@warehouse/shared';
import { useSellerSetup } from '../hooks/useEbayListing';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { fetchQueuePlan, fetchQueueStatus, scheduleQueue, type PlannedListing } from '../lib/api';
import { useToastStore } from '../state/useToastStore';
import { Button } from './ui/Button';
import { SelectDropdown } from './ui/SelectDropdown';

const money = (v: number | null) => (v == null ? '—' : v.toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
const day = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const HOURS = Array.from({ length: 24 }, (_, h) =>
  new Date(2026, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' })
);

function Policy({
  label,
  list,
  value,
  onChange,
}: {
  label: string;
  list: SellerPolicy[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold text-textMuted">{label}</div>
      <SelectDropdown
        options={list.map((p) => p.name)}
        value={list.find((p) => p.id === value)?.name ?? ''}
        placeholder="Choose a policy"
        onChange={(name) => onChange(list.find((p) => p.name === name)?.id ?? '')}
      />
    </div>
  );
}

/**
 * A week of listings in one sitting: SPARE proposes the parts, day by day, and nothing is
 * sent until an admin approves the batch. eBay then holds each listing until its start
 * time, so SPARE has no part to play once the batch is away.
 */
export function ListingQueueDialog({ onClose }: { onClose: () => void }) {
  useBodyScrollLock(true);
  const toast = useToastStore((s) => s.show);
  const qc = useQueryClient();

  const [days, setDays] = useState(7);
  const [perDay, setPerDay] = useState(10);
  const [hour, setHour] = useState(9);
  // Parts the reviewer has taken out of the batch.
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [policies, setPolicies] = useState<PolicyChoice | null>(null);

  const setup = useSellerSetup(true);
  const plan = useQuery({
    queryKey: ['listing-queue-plan', days, perDay, hour],
    queryFn: () => fetchQueuePlan(days, perDay, hour),
  });
  const status = useQuery({
    queryKey: ['listing-queue-status'],
    queryFn: fetchQueueStatus,
    refetchInterval: (q) => (q.state.data?.running ? 4000 : false),
  });

  useEffect(() => {
    const s = setup.data;
    if (!s) return;
    setPolicies((prev) => ({
      shipping: prev?.shipping || s.defaults.shipping || s.shipping[0]?.id || '',
      returns: prev?.returns || s.defaults.returns || s.returns[0]?.id || '',
      payment: prev?.payment || s.defaults.payment || s.payment[0]?.id || '',
    }));
  }, [setup.data]);

  const keeping = (plan.data?.items ?? []).filter((i) => !dropped.has(i.partId));
  const ready = keeping.filter((i) => i.problems.length === 0);

  const schedule = useMutation({
    mutationFn: () =>
      scheduleQueue(
        ready.map((i) => ({ partId: i.partId, startAt: i.startAt, listing: i.listing })),
        policies!
      ),
    onSuccess: () => {
      toast(`Scheduling ${ready.length} listings. eBay holds each until its day.`);
      void qc.invalidateQueries({ queryKey: ['listing-queue-status'] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not schedule the batch', 'error'),
  });

  const running = status.data?.running;
  const byDay = new Map<string, PlannedListing[]>();
  for (const item of keeping) {
    const key = day(item.startAt);
    byDay.set(key, [...(byDay.get(key) ?? []), item]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-card bg-surface">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-surfaceMuted p-4">
          <div>
            <h2 className="flex items-center gap-1.5 text-base font-semibold text-textPri">
              <CalendarClock size={16} /> Schedule a batch
            </h2>
            <p className="mt-0.5 text-[11px] text-textMuted">
              SPARE picks the best-ranked parts that are researched and ready. Nothing is sent until you approve.
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
          <div className="grid grid-cols-3 gap-2">
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
          </div>

          {setup.data && policies && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Policy
                label="Shipping"
                list={setup.data.shipping}
                value={policies.shipping}
                onChange={(shipping) => setPolicies({ ...policies, shipping })}
              />
              <Policy
                label="Returns"
                list={setup.data.returns}
                value={policies.returns}
                onChange={(returns) => setPolicies({ ...policies, returns })}
              />
              <Policy
                label="Payment"
                list={setup.data.payment}
                value={policies.payment}
                onChange={(payment) => setPolicies({ ...policies, payment })}
              />
            </div>
          )}

          {plan.isFetching && <p className="mt-4 text-xs text-textMuted">Working out what to list…</p>}
          {plan.error && <p className="mt-4 text-xs text-red-600">{plan.error.message}</p>}

          {plan.data && !plan.isFetching && (
            <>
              <p className="mt-4 text-[11px] text-textMuted">
                {plan.data.items.length} to schedule
                {plan.data.remaining > 0 && `, ${plan.data.remaining} more ready for another batch`}
                {plan.data.unresearched > 0 && `, ${plan.data.unresearched} waiting on research`}.
              </p>

              {[...byDay.entries()].map(([label, items]) => (
                <section key={label} className="mt-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-textMuted">
                    {label} — {items.length} {items.length === 1 ? 'listing' : 'listings'}
                  </h3>
                  <ul className="mt-1">
                    {items.map((item) => (
                      <li key={item.partId} className="flex items-start gap-2 border-b border-border py-2 last:border-0">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-textPri">{item.title}</div>
                          <div className="mt-0.5 text-[11px] text-textMuted">
                            {item.sku} · {item.condition} · qty {item.quantity} · {item.photos} photos ·{' '}
                            {time(item.startAt)}
                          </div>
                          {item.problems.length > 0 && (
                            <div className="mt-1 flex items-start gap-1 text-[11px] font-semibold text-amber-600">
                              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                              {item.problems.join(' ')}
                            </div>
                          )}
                        </div>
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
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
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
            {ready.length} of {keeping.length} will be scheduled
            {keeping.length !== ready.length && ' — the rest need fixing first'}
          </span>
          <Button
            type="button"
            onClick={() => schedule.mutate()}
            disabled={!ready.length || !policies || schedule.isPending || running}
            className="ml-auto"
          >
            <Check size={14} />
            {schedule.isPending || running ? 'Scheduling…' : `Schedule ${ready.length}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
