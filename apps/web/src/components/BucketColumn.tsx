import { useMemo, useState, type ReactElement } from 'react';
import { ChevronDown, ClipboardList, Tag, Wrench } from 'lucide-react';
import { salesForGroup, type Listing, type PartGroup, type SalesIndex, type WorkflowStatus } from '@warehouse/shared';
import { cn } from '../lib/cn';
import { PartCard } from './PartCard';

const BUCKET_META: Record<WorkflowStatus, { label: string; icon: ReactElement; badgeBg: string; iconColor: string }> = {
  NotStarted: { label: 'Not Started', icon: <ClipboardList size={18} />, badgeBg: 'bg-blue-500', iconColor: 'text-white' },
  Processing: { label: 'Processing', icon: <Wrench size={18} />, badgeBg: 'bg-amber-500', iconColor: 'text-white' },
  Listed: { label: 'Listed / Sold', icon: <Tag size={18} />, badgeBg: 'bg-primary', iconColor: 'text-white' },
};

export function BucketColumn({
  status,
  parts,
  salesIndex,
  listingsIndex,
}: {
  status: WorkflowStatus;
  parts: PartGroup[];
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
  // Mobile stacks all three buckets vertically, so an expanded one buries the others under
  // hundreds of cards. Collapsed by default there; on desktop the columns sit side by side
  // and are always open, so this state is simply ignored from `lg:` up.
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col rounded-card border border-border bg-surfaceMuted lg:h-full lg:min-h-0">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 rounded-t-card border-b border-border bg-columnHeaderBg p-4 text-left lg:pointer-events-none"
      >
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${meta.badgeBg} ${meta.iconColor}`}>
          {meta.icon}
        </div>
        <span className="text-sm font-semibold text-textPri">{meta.label}</span>
        <span className="ml-auto rounded-pill border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-textMuted">
          {shown.length}
        </span>
        <ChevronDown
          size={18}
          className={cn('shrink-0 text-textMuted transition-transform lg:hidden', expanded && 'rotate-180')}
        />
      </button>
      {/* Tabs rather than a segmented control: this changes what you are looking at, not a
          mode you are setting, and in a 396px column the lighter object is the right one —
          the cards below are the content, and the control should not outweigh them. */}
      {split && (
        <div
          role="tablist"
          aria-label="Filter by eBay state"
          className={cn(
            'shrink-0 gap-4 border-b border-border px-4 lg:flex',
            expanded ? 'flex' : 'hidden'
          )}
        >
          {(
            [
              ['all', 'All', parts.length],
              ['listed', 'Listed', split.listed.length],
              ['sold', 'Sold', split.sold.length],
            ] as const
          ).map(([key, label, count]) => {
            const active = ebayView === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setEbayView(key)}
                className={cn(
                  'flex min-h-0 items-center gap-1.5 border-b-2 py-2.5 text-xs font-semibold transition-colors',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-textMuted hover:text-textPri'
                )}
              >
                {label}
                <span className="font-medium tabular-nums text-textMuted">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div
        className={cn(
          'column-scroll min-h-0 max-h-[640px] flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4 lg:flex lg:max-h-none',
          expanded ? 'flex' : 'hidden'
        )}
      >
        {shown.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-card border border-dashed border-border p-8 text-center text-xs text-textMuted">
            No parts match the selected filters in this bucket.
          </div>
        ) : (
          shown.map((p) => (
            <PartCard key={p.id} part={p} salesIndex={salesIndex} listingsIndex={listingsIndex} />
          ))
        )}
      </div>
    </div>
  );
}
