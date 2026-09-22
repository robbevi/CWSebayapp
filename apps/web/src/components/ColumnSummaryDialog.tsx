import { X } from 'lucide-react';
import {
  columnSummary,
  type Listing,
  type PartGroup,
  type SalesIndex,
  type WorkflowStatus,
} from '@warehouse/shared';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { cn } from '../lib/cn';

const money = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const count = (v: number) => v.toLocaleString();

const TITLES: Record<WorkflowStatus, string> = {
  NotStarted: 'Not Started',
  Processing: 'Processing',
  Listed: 'Listed / Sold',
};

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <div className="rounded-btn border border-border bg-surface p-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-textMuted">{label}</div>
      <div className={cn('mt-0.5 text-lg font-bold tabular-nums', tone === 'warn' ? 'text-amber-600' : 'text-textPri')}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-textMuted">{sub}</div>}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-textMuted">{title}</h3>
      {note && <p className="mt-0.5 text-[11px] text-textMuted">{note}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** A row of a small table: what it is, how many parts, and what they are worth. */
function Row({ label, parts, value, of }: { label: string; parts: number; value?: number; of: number }) {
  const share = of > 0 ? Math.round((parts / of) * 100) : 0;
  return (
    <div className="flex items-center gap-2 border-b border-border py-1.5 text-xs last:border-0">
      <span className="w-32 shrink-0 text-textPri">{label}</span>
      {/* The bar carries the share, so the eye finds where the pile sits without reading. */}
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surfaceMuted">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
      </span>
      <span className="w-20 shrink-0 text-right tabular-nums text-textPri">
        {count(parts)} <span className="text-textMuted">({share}%)</span>
      </span>
      {value != null && <span className="w-20 shrink-0 text-right tabular-nums text-textMuted">{money(value)}</span>}
    </div>
  );
}

/**
 * Everything a column amounts to, for the question asked away from the floor: where does
 * this pile stand, what is it worth, and what has been sitting in it longest.
 *
 * Reads the parts the board is showing, so it answers through whatever filters are set.
 */
export function ColumnSummaryDialog({
  status,
  groups,
  filteredFrom,
  salesIndex,
  listingsIndex,
  onClose,
}: {
  status: WorkflowStatus;
  groups: PartGroup[];
  /** The column's unfiltered size, when filters are narrowing what is counted. */
  filteredFrom?: number;
  salesIndex: SalesIndex;
  listingsIndex: Map<string, Listing>;
  onClose: () => void;
}) {
  useBodyScrollLock(true);
  const s = columnSummary(status, groups, salesIndex, listingsIndex);
  const filtered = filteredFrom != null && filteredFrom !== s.parts;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-card bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-textPri">{TITLES[status]}</h2>
            <p className="mt-0.5 text-[11px] text-textMuted">
              {filtered
                ? `${count(s.parts)} of ${count(filteredFrom!)} parts, as filtered`
                : `${count(s.parts)} parts`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-btn p-1 text-textMuted hover:bg-surfaceMuted"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Parts" value={count(s.parts)} sub={`${count(s.records)} stock rows`} />
          <Stat label="Quantity" value={count(s.qoh)} sub="on hand per the system" />
          <Stat
            label={status === 'Listed' ? 'Est. recovery' : 'Est. recovery'}
            value={money(s.value)}
            sub={s.unpriced > 0 ? `${count(s.unpriced)} carried at nothing` : 'every part priced'}
          />
          <Stat
            label="Longest waiting"
            value={s.oldestDays != null ? `${count(s.oldestDays)} days` : '—'}
            sub={s.medianDays != null ? `${count(s.medianDays)} days is typical` : undefined}
            tone={(s.oldestDays ?? 0) > 90 ? 'warn' : undefined}
          />
        </div>

        {s.listings && (
          <Section title="On eBay">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Live" value={count(s.listings.live)} sub={money(s.listings.askingValue) + ' asking'} />
              <Stat
                label="Sold"
                value={count(s.listings.soldOut)}
                sub={`${money(s.listings.soldValue)} taken${s.listings.partSold ? `, ${s.listings.partSold} part-sold` : ''}`}
              />
              <Stat
                label="Views"
                value={count(s.listings.views)}
                sub={`${count(s.listings.impressions)} impressions`}
              />
              <Stat
                label="Watchers"
                value={count(s.listings.watchers)}
                sub={s.listings.noViews > 0 ? `${count(s.listings.noViews)} with no views yet` : undefined}
                tone={s.listings.noViews > 0 ? 'warn' : undefined}
              />
            </div>
          </Section>
        )}

        <Section title="How far along" note="Parts by the number of the five checkpoints finished.">
          {s.progress
            .filter((p) => p.parts > 0)
            .reverse()
            .map((p) => (
              <Row key={p.done} label={`${p.done} of 5 done`} parts={p.parts} value={p.value} of={s.parts} />
            ))}
        </Section>

        <Section title="Each step" note="Parts that have finished each step, whatever else is outstanding.">
          {s.tasks.map((t) => (
            <Row key={t.key} label={t.label} parts={t.parts} of={s.parts} />
          ))}
        </Section>

        <Section title="Time in this column" note="Since anyone last photographed, counted, graded or edited the part.">
          {s.ageBands.map((b) => (
            <Row key={b.label} label={b.label} parts={b.parts} value={b.value} of={s.parts} />
          ))}
        </Section>

        <Section title="By site">
          {s.sites.slice(0, 8).map((site) => (
            <Row key={site.site} label={site.site} parts={site.parts} value={site.value} of={s.parts} />
          ))}
        </Section>

        {(s.needsReview > 0 || s.discrepancies > 0) && (
          <Section title="Wants attention">
            <div className="grid grid-cols-2 gap-2">
              <Stat
                label="Flagged for review"
                value={count(s.needsReview)}
                tone={s.needsReview > 0 ? 'warn' : undefined}
              />
              <Stat
                label="Count disagrees"
                value={count(s.discrepancies)}
                sub="counted against the system"
                tone={s.discrepancies > 0 ? 'warn' : undefined}
              />
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
