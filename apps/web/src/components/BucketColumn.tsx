import type { ReactElement } from 'react';
import { CheckCircle2, ClipboardList, Wrench } from 'lucide-react';
import type { InventoryPart, WorkflowStatus } from '@warehouse/shared';
import { PartCard } from './PartCard';

const BUCKET_META: Record<WorkflowStatus, { label: string; icon: ReactElement; badgeBg: string; iconColor: string }> = {
  NotStarted: { label: 'Not Started', icon: <ClipboardList size={18} />, badgeBg: 'bg-gray-200', iconColor: 'text-gray-600' },
  Processing: { label: 'Processing', icon: <Wrench size={18} />, badgeBg: 'bg-amber-500', iconColor: 'text-white' },
  Completed: { label: 'Completed', icon: <CheckCircle2 size={18} />, badgeBg: 'bg-primary', iconColor: 'text-white' },
};

export function BucketColumn({ status, parts }: { status: WorkflowStatus; parts: InventoryPart[] }) {
  const meta = BUCKET_META[status];
  return (
    <div className="flex flex-col rounded-card border border-border bg-columnBg lg:h-full lg:min-h-0">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${meta.badgeBg} ${meta.iconColor}`}>
          {meta.icon}
        </div>
        <span className="text-sm font-semibold text-textPri">{meta.label}</span>
        <span className="ml-auto rounded-pill border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-textMuted">
          {parts.length}
        </span>
      </div>
      <div className="flex max-h-[1900px] flex-1 flex-col gap-3 overflow-y-auto p-4 lg:max-h-none lg:min-h-0">
        {parts.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-card border border-dashed border-border p-8 text-center text-xs text-textMuted">
            No parts match the selected filters in this bucket.
          </div>
        ) : (
          parts.map((p) => <PartCard key={p.id} part={p} />)
        )}
      </div>
    </div>
  );
}
