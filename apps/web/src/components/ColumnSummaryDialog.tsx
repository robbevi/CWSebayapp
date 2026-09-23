import { Filter, X } from 'lucide-react';
import {
  columnSummary,
  type AgeBandKey,
  type Listing,
  type PartGroup,
  type SalesIndex,
  type TaskKey,
  type WorkflowStatus,
} from '@warehouse/shared';
import type { DiscrepancyFilter, SaleFilter } from '../state/useUIStore';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { cn } from '../lib/cn';

const money = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const count = (v: number) => v.toLocaleString();

/** The filters a figure in here can set, mirroring the board's own filter state. */
export interface FilterPatch {
  statuses?: WorkflowStatus[];
  progress?: number[];
  completedTasks?: TaskKey[];
  ages?: AgeBandKey[];
  sites?: string[];
  needsReview?: boolean;
  discrepancies?: DiscrepancyFilter[];
  sales?: SaleFilter[];
}

const TITLES: Record<WorkflowStatus, string> = {
  NotStarted: 'Not Started',
  Processing: 'Processing',
  Listed: 'Listed / Sold',
};

function Stat({
  label,
  value,
  sub,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'warn';
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={onClick ? 'Show these on the board' : undefined}
      className={cn(
        'w-full rounded-btn border border-border bg-surface p-2.5 text-left',
        onClick && 'hover:border-primary/50 hover:bg-surfaceMuted'
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-textMuted">{label}</div>
      <div className={cn('mt-0.5 text-lg font-bold tabular-nums', tone === 'warn' ? 'text-amber-600' : 'text-textPri')}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-textMuted">{sub}</div>}
    </Tag>
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

/**
 * A row of a small table: what it is, how many parts, and what they are worth. Given a
 * filter, the whole row becomes the way to go and look at those parts on the board.
 */
function Row({
  label,
  parts,
  value,
  of,
  onFilter,
}: {
  label: string;
  parts: number;
  value?: number;
  of: number;
  onFilter?: () => void;
}) {
  const share = of > 0 ? Math.round((parts / of) * 100) : 0;
  const clickable = !!onFilter && parts > 0;
  const Tag = clickable ? 'button' : 'div';
  return (
    <Tag
      type={clickable ? 'button' : undefined}
      onClick={clickable ? onFilter : undefined}
      title={clickable ? `Show these ${count(parts)} on the board` : undefined}
      className={cn(
        'group flex w-full items-center gap-2 border-b border-border py-1.5 text-left text-xs last:border-0',
        clickable && 'min-h-0 hover:bg-surfaceMuted'
      )}
    >
      <span className="flex w-32 shrink-0 items-center gap-1 text-textPri">
        {label}
        {clickable && (
          <Filter size={10} className="shrink-0 text-textMuted opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </span>
      {/* The bar carries the share, so the eye finds where the pile sits without reading. */}
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surfaceMuted">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
      </span>
      <span className="w-20 shrink-0 text-right tabular-nums text-textPri">
        {count(parts)} <span className="text-textMuted">({share}%)</span>
      </span>
      {value != null && <span className="w-20 shrink-0 text-right tabular-nums text-textMuted">{money(value)}</span>}
    </Tag>
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
  onFilter,
}: {
  status: WorkflowStatus;
  groups: PartGroup[];
  /** The column's unfiltered size, when filters are narrowing what is counted. */
  filteredFrom?: number;
  salesIndex: SalesIndex;
  listingsIndex: Map<string, Listing>;
  onClose: () => void;
  /** Narrows the board to the parts behind a figure, and closes this. */
  onFilter: (patch: FilterPatch) => void;
}) {
  useBodyScrollLock(true);
  const s = columnSummary(status, groups, salesIndex, listingsIndex);
  // Every filter starts from this column, so clicking a figure never lands somewhere that
  // mixes in parts from the other two.
  const show = (patch: FilterPatch) => onFilter({ statuses: [status], ...patch });
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
            sub={s.unpriced > 0 ? `${count(s.unpriced)} unpriced` : 'every part priced'}
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
              <Row
                key={p.done}
                label={`${p.done} of 5 done`}
                parts={p.parts}
                value={p.value}
                of={s.parts}
                onFilter={() => show({ progress: [p.done] })}
              />
            ))}
        </Section>

        <Section title="Each step" note="Parts that have finished each step, whatever else is outstanding.">
          {s.tasks.map((t) => (
            <Row
              key={t.key}
              label={t.label}
              parts={t.parts}
              of={s.parts}
              onFilter={() => show({ completedTasks: [t.key] })}
            />
          ))}
        </Section>

        <Section title="Time in this column" note="Since anyone last photographed, counted, graded or edited the part.">
          {s.ageBands.map((b) => (
            <Row
              key={b.key}
              label={b.label}
              parts={b.parts}
              value={b.value}
              of={s.parts}
              onFilter={() => show({ ages: [b.key] })}
            />
          ))}
        </Section>

        <Section title="By site">
          {s.sites.slice(0, 8).map((site) => (
            <Row
              key={site.site}
              label={site.site}
              parts={site.parts}
              value={site.value}
              of={s.parts}
              onFilter={() => show({ sites: [site.site] })}
            />
          ))}
        </Section>

        {(s.needsReview > 0 || s.discrepancies > 0) && (
          <Section title="Wants attention">
            <div className="grid grid-cols-2 gap-2">
              <Stat
                label="Flagged for review"
                value={count(s.needsReview)}
                tone={s.needsReview > 0 ? 'warn' : undefined}
                onClick={s.needsReview > 0 ? () => show({ needsReview: true }) : undefined}
              />
              <Stat
                label="Count disagrees"
                value={count(s.discrepancies)}
                sub="counted against the system"
                tone={s.discrepancies > 0 ? 'warn' : undefined}
                onClick={
                  s.discrepancies > 0
                    ? () => show({ discrepancies: ['shortage', 'overage', 'notFound'] })
                    : undefined
                }
              />
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
