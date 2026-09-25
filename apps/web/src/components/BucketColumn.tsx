import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { ChevronDown, ClipboardList, Tag, Wrench } from 'lucide-react';
import {
  extendedValue,
  listingFor,
  salesForGroup,
  type Listing,
  type PartGroup,
  type SalesIndex,
  type WorkflowStatus,
} from '@warehouse/shared';
import { cn } from '../lib/cn';
import { ColumnSummaryDialog, type FilterPatch } from './ColumnSummaryDialog';
import { useUIStore } from '../state/useUIStore';
import { PartCard } from './PartCard';
import { SelectDropdown } from './ui/SelectDropdown';

/** Cards drawn at a time: a screenful or two ahead of wherever the column is scrolled. */
const PAGE = 40;

const BUCKET_META: Record<WorkflowStatus, { label: string; icon: ReactElement; badgeBg: string; iconColor: string }> = {
  NotStarted: { label: 'Not Started', icon: <ClipboardList size={18} />, badgeBg: 'bg-blue-500', iconColor: 'text-white' },
  Processing: { label: 'Processing', icon: <Wrench size={18} />, badgeBg: 'bg-amber-500', iconColor: 'text-white' },
  Listed: { label: 'Listed / Sold', icon: <Tag size={18} />, badgeBg: 'bg-primary', iconColor: 'text-white' },
};

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/**
 * What the column is worth, in the terms that fit it: stock still to be sold is carried at
 * its recovery basis, while anything on eBay is worth what eBay is currently asking. Shown
 * for what is on screen, so it answers the filters rather than the whole catalogue.
 */
function columnValue(
  status: WorkflowStatus,
  parts: PartGroup[],
  listingsIndex: Map<string, Listing>
): { label: string; value: number } {
  if (status !== 'Listed') {
    return { label: 'Est. Recovery', value: parts.reduce((sum, g) => sum + extendedValue(g), 0) };
  }
  const value = parts.reduce((sum, g) => {
    const listing = listingFor(g.records, listingsIndex);
    return sum + (listing ? listing.price * listing.quantityAvailable : 0);
  }, 0);
  return { label: 'Live on eBay', value };
}

export function BucketColumn({
  status,
  parts,
  total,
  expanded,
  onToggleExpanded,
  className,
  salesIndex,
  listingsIndex,
}: {
  status: WorkflowStatus;
  parts: PartGroup[];
  /** Everything in this column before any filter, so a filtered count says what it is out of. */
  total: number;
  /** Below lg, whether this is the column being worked in. Ignored from lg up. */
  expanded: boolean;
  onToggleExpanded: () => void;
  className?: string;
  salesIndex: SalesIndex;
  listingsIndex: Map<string, Listing>;
}) {
  const meta = BUCKET_META[status];
  // Within the eBay column, split what is still for sale from what has gone. Local state:
  // it is a way of reading one column, not a filter over the whole board.
  const [ebayView, setEbayView] = useState<'all' | 'listed' | 'sold'>('all');

  const split = useMemo(() => {
    if (status !== 'Listed') return null;
    const sold: PartGroup[] = [];
    const listed: PartGroup[] = [];
    for (const p of parts) {
      (salesForGroup(p, salesIndex).length > 0 ? sold : listed).push(p);
    }
    return { sold, listed };
  }, [status, parts, salesIndex]);

  const shown = split && ebayView !== 'all' ? (ebayView === 'sold' ? split.sold : split.listed) : parts;
  const [summaryOpen, setSummaryOpen] = useState(false);

  /**
   * Cards are drawn a page at a time as the column is scrolled, not all 1,600 of Not Started
   * at once. Drawing every card was most of the time the board took to appear, and on a
   * tablet it was spent on columns that were not even open.
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(PAGE);

  // A new filter or sort starts back at the top, with the first page.
  useEffect(() => {
    setRendered(PAGE);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [shown]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setRendered((n) => n + PAGE);
      },
      // Start drawing the next page a little before the last card is reached.
      { root: scrollRef.current, rootMargin: '600px 0px' }
    );
    seen.observe(sentinel);
    return () => seen.disconnect();
  }, [rendered, shown.length, expanded]);
  const setFilters = useUIStore((s) => s.set);

  // A count on its own can't say whether a column is small or merely filtered.
  const filtered = shown.length !== total;

  const subtotal = useMemo(() => columnValue(status, shown, listingsIndex), [status, shown, listingsIndex]);

  return (
    <div className={cn('flex flex-col rounded-card border border-border bg-surfaceMuted lg:h-full lg:min-h-0', className)}>
      <div className="flex w-full items-center gap-3 rounded-t-card border-b border-border bg-columnHeaderBg p-4">
        {/* Only the left of the header toggles the column, so the count beside it can be a
            control of its own. Inert from lg up, where columns are always open. */}
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-3 text-left lg:pointer-events-none"
        >
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${meta.badgeBg} ${meta.iconColor}`}
          >
            {meta.icon}
          </div>
          <span className="min-w-0">
            <span className="block text-base font-medium text-textPri lg:text-lg">{meta.label}</span>
            {/* Desktop only: on a phone the columns stack and collapse, where another line
                sits between someone and their work. */}
            <span className="hidden text-[11px] leading-tight text-textMuted lg:block">
              <span className="font-semibold tabular-nums text-textPri">{money(subtotal.value)}</span>{' '}
              {subtotal.label}
            </span>
          </span>
        </button>

        {split ? (
          /* The count is the control. Clicking it offers All / Listed / Sold, so nothing
             takes up room until it is asked for. */
          <SelectDropdown
            options={[
              `All ${parts.length}`,
              `Listed ${split.listed.length}`,
              `Sold ${split.sold.length}`,
            ]}
            value={
              ebayView === 'listed'
                ? `Listed ${split.listed.length}`
                : ebayView === 'sold'
                  ? `Sold ${split.sold.length}`
                  : `All ${parts.length}`
            }
            // Matched on the leading word, since the counts move as things sell.
            onChange={(v) =>
              setEbayView(v.startsWith('Listed') ? 'listed' : v.startsWith('Sold') ? 'sold' : 'all')
            }
            renderTrigger={({ open }) => (
              <span
                className={cn(
                  'flex items-center gap-1 rounded-pill border bg-surface px-2.5 py-1 text-xs font-semibold',
                  ebayView === 'all'
                    ? 'border-border text-textMuted'
                    : 'border-primary/40 text-primary',
                  open && 'border-primary/50 ring-2 ring-primary/40'
                )}
                title="Show all, only listed, or only sold"
              >
                {ebayView !== 'all' && (
                  <span className="font-medium">{ebayView === 'sold' ? 'Sold' : 'Listed'}</span>
                )}
                {shown.length}
                {filtered && ebayView === 'all' && <span className="font-normal opacity-70"> of {total}</span>}
                <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
              </span>
            )}
          />
        ) : (
          <span
            className="rounded-pill border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-textMuted"
            title={filtered ? `${shown.length} of ${total} shown by the current filters` : undefined}
          >
            {shown.length}
            {filtered && <span className="font-normal text-textMuted/70"> of {total}</span>}
          </span>
        )}

        <button
          type="button"
          onClick={onToggleExpanded}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className="min-h-0 shrink-0 lg:hidden"
        >
          <ChevronDown
            size={18}
            className={cn('text-textMuted transition-transform', expanded && 'rotate-180')}
          />
        </button>
        {/* Desktop keeps the columns open, so the same arrow opens what the column adds up
            to instead of collapsing it. */}
        <button
          type="button"
          onClick={() => setSummaryOpen(true)}
          aria-label={`${meta.label} summary`}
          title="Everything this column adds up to"
          className="hidden min-h-0 shrink-0 rounded-btn p-1 text-textMuted hover:bg-surface hover:text-textPri lg:block"
        >
          <ChevronDown size={18} />
        </button>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'column-scroll min-h-0 max-h-[calc(100vh-15rem)] flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4 lg:flex lg:max-h-none',
          expanded ? 'flex' : 'hidden'
        )}
      >
        {shown.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-card border border-dashed border-border p-8 text-center text-xs text-textMuted">
            No parts match the selected filters in this bucket.
          </div>
        ) : (
          <>
            {shown.slice(0, rendered).map((p) => (
              <PartCard key={p.id} part={p} salesIndex={salesIndex} listingsIndex={listingsIndex} />
            ))}
            {/* Reaching this draws the next page of cards. */}
            {rendered < shown.length && (
              <div ref={sentinelRef} className="py-3 text-center text-[11px] text-textMuted">
                Showing {rendered} of {shown.length}…
              </div>
            )}
          </>
        )}
      </div>

      {summaryOpen && (
        <ColumnSummaryDialog
          status={status}
          groups={shown}
          filteredFrom={total}
          salesIndex={salesIndex}
          listingsIndex={listingsIndex}
          onClose={() => setSummaryOpen(false)}
          onFilter={(patch: FilterPatch) => {
            setFilters(patch);
            setSummaryOpen(false);
          }}
        />
      )}
    </div>
  );
}
