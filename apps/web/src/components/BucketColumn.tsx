import { useMemo, useState, type ReactElement } from 'react';
import { ChevronDown, ClipboardList, Tag, Wrench } from 'lucide-react';
import { salesForGroup, type Listing, type PartGroup, type SalesIndex, type WorkflowStatus } from '@warehouse/shared';
import { cn } from '../lib/cn';
import { PartCard } from './PartCard';
import { SelectDropdown } from './ui/SelectDropdown';

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
      <div className="flex w-full items-center gap-3 rounded-t-card border-b border-border bg-columnHeaderBg p-4">
        {/* Only the left of the header toggles the column, so the count beside it can be a
            control of its own. Inert from lg up, where columns are always open. */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-3 text-left lg:pointer-events-none"
        >
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${meta.badgeBg} ${meta.iconColor}`}
          >
            {meta.icon}
          </div>
          <span className="text-sm font-semibold text-textPri">{meta.label}</span>
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
                <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
              </span>
            )}
          />
        ) : (
          <span className="rounded-pill border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-textMuted">
            {shown.length}
          </span>
        )}

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className="min-h-0 shrink-0 lg:hidden"
        >
          <ChevronDown
            size={18}
            className={cn('text-textMuted transition-transform', expanded && 'rotate-180')}
          />
        </button>
      </div>

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
