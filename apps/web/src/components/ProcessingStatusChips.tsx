import { Camera, Check, Package, ShieldCheck, Tag, Truck } from 'lucide-react';
import { checkpointCount } from '@warehouse/shared';
import type { InventoryPart } from '@warehouse/shared';
import { cn } from '../lib/cn';

// Structurally typed rather than tied to InventoryPart, so a grouped SKU — which carries
// the same merged checkpoint fields — renders through this component unchanged.
type Checkpointed = Pick<
  InventoryPart,
  'photographed' | 'confirmedQoh' | 'boxCondition' | 'transferredToMarketRecovery' | 'itemListed'
>;

const TOTAL = 5;

export function ProcessingStatusChips({ part }: { part: Checkpointed }) {
  const count = checkpointCount(part);
  const chips = [
    { label: 'Photographed', active: part.photographed, icon: <Camera size={12} /> },
    {
      label: `Qty Confirmed${part.confirmedQoh != null ? `: ${part.confirmedQoh}` : ''}`,
      active: part.confirmedQoh != null,
      icon: <Package size={12} />,
    },
    { label: 'Condition', active: !!part.boxCondition, icon: <ShieldCheck size={12} /> },
    { label: 'Transferred', active: part.transferredToMarketRecovery, icon: <Truck size={12} /> },
    { label: 'Listed', active: part.itemListed, icon: <Tag size={12} /> },
  ];

  return (
    // A panel of its own, because this is the part of the card people act on: everything
    // above is what the part is, this is what is left to do to it.
    <div className="rounded-btn border border-border bg-surfaceMuted/60 p-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-textMuted">Processing</span>
        {/* Fills from the left by how many are done, not by which ones: the steps are not
            worked in a fixed order, and a lit segment in the middle reads as a gap. */}
        <span className="flex flex-1 items-center gap-1" aria-hidden="true">
          {chips.map((c, i) => (
            <span
              key={c.label}
              className={cn('h-1 flex-1 rounded-full', i < count ? 'bg-primary' : 'bg-border')}
            />
          ))}
        </span>
        <span
          className={cn(
            'shrink-0 text-[11px] font-bold tabular-nums',
            count === TOTAL ? 'text-primary' : 'text-textPri'
          )}
        >
          {count}/{TOTAL}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {chips.map((c) => (
          <span
            key={c.label}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-medium whitespace-nowrap',
              c.active
                ? 'border-primary bg-primary text-white'
                : // Dashed, so an outstanding step reads as an empty slot rather than a
                  // quieter version of a finished one.
                  'border-dashed border-border bg-surface text-textMuted'
            )}
          >
            {c.active ? <Check size={12} className="shrink-0" /> : <span className="shrink-0">{c.icon}</span>}
            <span className="truncate">{c.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
