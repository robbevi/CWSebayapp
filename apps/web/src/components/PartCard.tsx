import { AlertTriangle, ArrowRight, DollarSign, Factory, MapPin, Package, Wrench } from 'lucide-react';
import {
  formatVariance,
  getDiscrepancy,
  isHighPriority,
  isPositiveMargin,
  type InventoryPart,
} from '@warehouse/shared';
import { cn } from '../lib/cn';
import { useUIStore } from '../state/useUIStore';
import { Pill } from './ui/Pill';
import { ProcessingStatusChips } from './ProcessingStatusChips';

export function PartCard({ part }: { part: InventoryPart }) {
  const set = useUIStore((s) => s.set);
  const discrepancy = getDiscrepancy(part);

  return (
    <button
      onClick={() => set({ selectedId: part.id, modalOpen: true })}
      className="shrink-0 rounded-[10px] border border-border bg-surface p-3 text-left transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 text-sm font-semibold text-textPri">{part.sku}</span>
        {isHighPriority(part.fieldReviewPriority) && (
          <span
            title={part.fieldReviewPriority}
            aria-label={`High priority: ${part.fieldReviewPriority}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"
          >
            <AlertTriangle size={12} />
          </span>
        )}
        {isPositiveMargin(part.grossMarginStatus) && (
          <span
            title="Positive gross margin"
            aria-label="Positive gross margin"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <DollarSign size={12} />
          </span>
        )}
      </div>
      <div className="mb-2 line-clamp-2 min-h-[2rem] text-xs leading-snug text-textMuted">{part.description}</div>
      {/* Same two-column grid as ProcessingStatusChips below, so the two blocks line up
          instead of one being a ragged wrap and the other a tidy grid. */}
      <div className="grid grid-cols-2 gap-1.5">
        <Pill tone="chip" className="w-full">
          <Wrench size={12} className="shrink-0" />
          <span className="truncate">{part.manufacturer || '—'}</span>
        </Pill>
        <Pill tone="chip" className="w-full">
          <Factory size={12} className="shrink-0" />
          <span className="truncate">{part.inventorySite || '—'}</span>
        </Pill>
        <Pill tone="chip" className="w-full">
          <MapPin size={12} className="shrink-0" />
          <span className="truncate">{part.binLocation || '—'}</span>
        </Pill>
        <Pill tone="chip" className="w-full">
          <Package size={12} className="shrink-0" />
          <span className="truncate">QOH: {part.qoh}</span>
        </Pill>
        {/* Only shown once the part has actually been moved, so an un-moved part's card
            looks exactly as it did before. */}
        {part.newBinLocation && (
          <Pill
            tone="chip"
            className="w-full border-primary/20 bg-primary/10 font-semibold text-primary"
          >
            <ArrowRight size={12} className="shrink-0" />
            <span className="truncate" title={`Moved to recovery bin ${part.newBinLocation}`}>
              {part.newBinLocation}
            </span>
          </Pill>
        )}
        {/* A counted-but-mismatched quantity is the one thing on a card that needs chasing,
            so it gets a hard colour rather than the neutral chip treatment. */}
        {discrepancy && discrepancy.kind !== 'none' && (
          <Pill
            className={cn(
              'w-full font-semibold',
              discrepancy.variance < 0
                ? 'border-red-200 bg-red-100 text-red-700'
                : 'border-amber-200 bg-amber-100 text-amber-700'
            )}
          >
            <AlertTriangle size={12} className="shrink-0" />
            <span className="truncate" title={`Counted ${part.confirmedQoh}, system says ${part.qoh}`}>
              {discrepancy.kind === 'notFound'
                ? `Not Found (${formatVariance(discrepancy.variance)})`
                : formatVariance(discrepancy.variance)}
            </span>
          </Pill>
        )}
      </div>
      {part.workflowStatus === 'Processing' && (
        <div className="mt-3">
          <ProcessingStatusChips part={part} />
        </div>
      )}
    </button>
  );
}
