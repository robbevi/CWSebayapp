import { useState, type ReactElement } from 'react';
import { CheckCircle2, ChevronDown, ClipboardList, Wrench } from 'lucide-react';
import type { Listing, PartGroup, SalesIndex, WorkflowStatus } from '@warehouse/shared';
import { cn } from '../lib/cn';
import { PartCard } from './PartCard';

const BUCKET_META: Record<WorkflowStatus, { label: string; icon: ReactElement; badgeBg: string; iconColor: string }> = {
  NotStarted: { label: 'Not Started', icon: <ClipboardList size={18} />, badgeBg: 'bg-blue-500', iconColor: 'text-white' },
  Processing: { label: 'Processing', icon: <Wrench size={18} />, badgeBg: 'bg-amber-500', iconColor: 'text-white' },
  Completed: { label: 'Completed', icon: <CheckCircle2 size={18} />, badgeBg: 'bg-primary', iconColor: 'text-white' },
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
          {parts.length}
        </span>
        <ChevronDown
          size={18}
          className={cn('shrink-0 text-textMuted transition-transform lg:hidden', expanded && 'rotate-180')}
        />
      </button>
      <div
        className={cn(
          'column-scroll min-h-0 max-h-[640px] flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4 lg:flex lg:max-h-none',
          expanded ? 'flex' : 'hidden'
        )}
      >
        {parts.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-card border border-dashed border-border p-8 text-center text-xs text-textMuted">
            No parts match the selected filters in this bucket.
          </div>
        ) : (
          parts.map((p) => (
            <PartCard key={p.id} part={p} salesIndex={salesIndex} listingsIndex={listingsIndex} />
          ))
        )}
      </div>
    </div>
  );
}
