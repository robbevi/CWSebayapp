import type { InventoryPart, WorkflowStatus } from './types.js';

export function checkpointCount(p: Pick<InventoryPart,
  'photographed' | 'confirmedQoh' | 'boxCondition' | 'transferredToMarketRecovery' | 'itemListed'
>): number {
  return [
    p.photographed === true,
    p.confirmedQoh !== null && p.confirmedQoh !== undefined,
    !!p.boxCondition,
    p.transferredToMarketRecovery === true,
    p.itemListed === true,
  ].filter(Boolean).length;
}

export function deriveStatus(p: Pick<InventoryPart,
  'photographed' | 'confirmedQoh' | 'boxCondition' | 'transferredToMarketRecovery' | 'itemListed' | 'photos'
>): WorkflowStatus {
  const c = checkpointCount(p);
  if (c === 5) return 'Completed';
  if (c === 0 && (p.photos?.length ?? 0) === 0) return 'NotStarted';
  return 'Processing';
}
