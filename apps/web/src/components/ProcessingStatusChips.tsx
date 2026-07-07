import { Camera, Package, ShieldCheck, Tag, Truck } from 'lucide-react';
import { checkpointCount } from '@warehouse/shared';
import type { InventoryPart } from '@warehouse/shared';
import { Pill } from './ui/Pill';

export function ProcessingStatusChips({ part }: { part: InventoryPart }) {
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
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-textMuted">Processing Status</span>
        <Pill tone="dark">{count}/5 complete</Pill>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {chips.map((c) => (
          <Pill key={c.label} active={c.active}>
            {c.icon}
            {c.label}
          </Pill>
        ))}
      </div>
    </div>
  );
}
