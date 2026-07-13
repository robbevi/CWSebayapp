import type { InventoryPart, WorkflowStatus } from './types.js';

export const TASK_KEYS = ['photographed', 'qtyConfirmed', 'conditionSet', 'transferred', 'listed'] as const;
export type TaskKey = (typeof TASK_KEYS)[number];

export function getCheckpoints(p: Pick<InventoryPart,
  'photographed' | 'confirmedQoh' | 'boxCondition' | 'transferredToMarketRecovery' | 'itemListed'
>): Record<TaskKey, boolean> {
  return {
    photographed: p.photographed === true,
    qtyConfirmed: p.confirmedQoh !== null && p.confirmedQoh !== undefined,
    conditionSet: !!p.boxCondition,
    transferred: p.transferredToMarketRecovery === true,
    listed: p.itemListed === true,
  };
}

export function checkpointCount(p: Pick<InventoryPart,
  'photographed' | 'confirmedQoh' | 'boxCondition' | 'transferredToMarketRecovery' | 'itemListed'
>): number {
  return Object.values(getCheckpoints(p)).filter(Boolean).length;
}

export function deriveStatus(p: Pick<InventoryPart,
  'photographed' | 'confirmedQoh' | 'boxCondition' | 'transferredToMarketRecovery' | 'itemListed' | 'photos'
>): WorkflowStatus {
  const c = checkpointCount(p);
  if (c === 5) return 'Completed';
  if (c === 0 && (p.photos?.length ?? 0) === 0) return 'NotStarted';
  return 'Processing';
}
