import { type PartGroup } from './grouping.js';
import { getCheckpoints } from './status.js';

export interface ProgramTotals {
  /** Distinct SKUs in the system. Doubles as the denominator for the rest. */
  added: number;
  photographed: number;
  listed: number;
  completed: number;
}

/**
 * Program-wide progress, counted per SKU rather than per sheet row so the numbers line up
 * with what the board shows. Read from the parts themselves rather than the submission
 * log: the log only started recording partway in, so it undercounts historical work.
 */
export function computeProgramTotals(groups: PartGroup[]): ProgramTotals {
  let photographed = 0;
  let listed = 0;
  let completed = 0;

  for (const g of groups) {
    const checkpoints = getCheckpoints(g);
    if (checkpoints.photographed) photographed++;
    if (checkpoints.listed) listed++;
    if (g.workflowStatus === 'Completed') completed++;
  }

  return { added: groups.length, photographed, listed, completed };
}

export function percentOf(value: number, total: number): string {
  if (total === 0) return '0%';
  const pct = (value / total) * 100;
  // Sub-1% work still deserves a number rather than a flat 0%.
  return pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`;
}
