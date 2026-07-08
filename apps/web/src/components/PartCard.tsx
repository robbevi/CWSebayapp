import { Factory, MapPin, Package, Wrench } from 'lucide-react';
import type { InventoryPart } from '@warehouse/shared';
import { useUIStore } from '../state/useUIStore';
import { Pill } from './ui/Pill';
import { ProcessingStatusChips } from './ProcessingStatusChips';

export function PartCard({ part }: { part: InventoryPart }) {
  const set = useUIStore((s) => s.set);

  return (
    <button
      onClick={() => set({ selectedId: part.id, modalOpen: true })}
      className="shrink-0 rounded-[10px] border border-border bg-surface p-3 text-left transition-shadow hover:shadow-md"
    >
      <div className="text-sm font-semibold text-textPri">{part.sku}</div>
      <div className="mb-2 line-clamp-2 min-h-[2rem] text-xs leading-snug text-textMuted">{part.description}</div>
      <div className="flex flex-wrap gap-1.5">
        <Pill tone="chip">
          <Wrench size={12} />
          {part.manufacturer || '—'}
        </Pill>
        <Pill tone="chip">
          <Factory size={12} />
          {part.inventorySite || '—'}
        </Pill>
        <Pill tone="chip">
          <MapPin size={12} />
          {part.binLocation || '—'}
        </Pill>
        <Pill tone="chip">
          <Package size={12} />
          QOH: {part.qoh}
        </Pill>
      </div>
      {part.workflowStatus === 'Processing' && (
        <div className="mt-3">
          <ProcessingStatusChips part={part} />
        </div>
      )}
    </button>
  );
}
