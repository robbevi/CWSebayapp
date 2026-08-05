import type { InventoryPart } from './types.js';

export type DiscrepancyKind = 'none' | 'shortage' | 'overage' | 'notFound';

export interface QtyDiscrepancy {
  /** Counted minus expected. Negative means fewer on the shelf than the system claims. */
  variance: number;
  kind: DiscrepancyKind;
}

type QtyFields = Pick<InventoryPart, 'qoh' | 'confirmedQoh'>;

// Null until somebody has actually counted: an uncounted part is not a discrepancy, it is
// simply unknown, and must not be lumped in with the parts that reconcile cleanly.
export function getDiscrepancy(p: QtyFields): QtyDiscrepancy | null {
  if (p.confirmedQoh === null || p.confirmedQoh === undefined) return null;
  const variance = p.confirmedQoh - (p.qoh ?? 0);
  if (variance === 0) return { variance, kind: 'none' };
  // "Should have some, found none" is called out separately from an ordinary shortage —
  // it usually means the part is lost or mis-binned rather than miscounted.
  if (p.confirmedQoh === 0 && (p.qoh ?? 0) > 0) return { variance, kind: 'notFound' };
  return { variance, kind: variance < 0 ? 'shortage' : 'overage' };
}

export function hasDiscrepancy(p: QtyFields): boolean {
  const d = getDiscrepancy(p);
  return d !== null && d.kind !== 'none';
}

/** Signed, for display: "-2", "+1". */
export function formatVariance(variance: number): string {
  return variance > 0 ? `+${variance}` : String(variance);
}

export const DISCREPANCY_LABELS: Record<Exclude<DiscrepancyKind, 'none'>, string> = {
  shortage: 'Short',
  overage: 'Over',
  notFound: 'Not Found',
};

export interface DiscrepancyLogEntry {
  sku: string;
  inventorySite: string;
  binLocation: string;
  expectedQoh: number;
  countedQoh: number;
  variance: number;
  kind: DiscrepancyKind;
  user: string;
  recordedAt: string;
}
