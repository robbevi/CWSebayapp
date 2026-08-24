import { getDiscrepancy } from './discrepancy.js';
import { checkpointCount, deriveStatus } from './status.js';
import type { InventoryPart, Photo, WorkflowStatus } from './types.js';

/**
 * One physical location a SKU is stocked at. The source sheet holds a separate row per
 * site/bin, and those rows are kept exactly as they are — this is a read-side view of one.
 */
export interface PartLocation {
  /** The underlying record id, so edits and photo uploads still target a real row. */
  id: string;
  inventorySite: string;
  binLocation: string;
  newBinLocation?: string;
  qoh: number;
  confirmedQoh: number | null;
}

/**
 * Every row sharing a SKU, presented as a single part. Quantities add up across locations
 * and a checkpoint counts as done if any location has it, because "this part has been
 * photographed" is a fact about the part rather than about one shelf.
 */
export interface PartGroup {
  sku: string;
  /** Mirrors `primary.id` so existing selection and routing keep working unchanged. */
  id: string;
  records: InventoryPart[];
  /** The record that owns SKU-level work (condition, listing, notes). */
  primary: InventoryPart;
  locations: PartLocation[];
  description: string;
  manufacturer: string;
  /** Primary's site/bin — what the card shows when the group has a single location. */
  inventorySite: string;
  binLocation: string;
  newBinLocation?: string;
  /** System quantity summed across every location. */
  qoh: number;
  /**
   * What we believe is actually on the shelf: each location's counted quantity where it
   * has one, its system quantity where it doesn't. Resolved per location rather than for
   * the group as a whole, so counting one bin of three doesn't discard the other two.
   */
  stockQty: number;
  confirmedQoh: number | null;
  /**
   * System quantity of only the locations that have been counted. This, not `qoh`, is the
   * fair baseline for a variance: with three bins and one counted, comparing against the
   * full total would report a shortage that is really just the two uncounted bins.
   */
  expectedForCounted: number;
  photos: Photo[];
  workflowStatus: WorkflowStatus;
  needsReview: boolean;
  needsReviewNote?: string;

  // Merged checkpoints. Named to match InventoryPart so getCheckpoints/checkpointCount and
  // the status chips accept a group directly, with no group-specific variants.
  photographed: boolean;
  boxCondition?: string;
  itemCondition?: string;
  transferredToMarketRecovery: boolean;
  itemListed: boolean;

  // Best value across the group's locations, so a SKU is ranked by its strongest row
  // rather than by whichever row happened to be primary.
  revenuePriorityRank?: number | null;
  fieldReviewPriority?: string;
  activeRecoveryPriceBasis?: number | null;
  expectedGrossRecoveryMargin?: number | null;
  grossMarginStatus?: string;
}

function toLocation(p: InventoryPart): PartLocation {
  return {
    id: p.id,
    inventorySite: p.inventorySite,
    binLocation: p.binLocation,
    newBinLocation: p.newBinLocation,
    qoh: p.qoh,
    confirmedQoh: p.confirmedQoh,
  };
}

/**
 * The record that carries SKU-level work. Most progress wins; ties break on import order
 * and then on id, so the choice is stable across reloads rather than depending on the
 * order the sheet happened to come back in.
 */
function pickPrimary(records: InventoryPart[]): InventoryPart {
  return [...records].sort((a, b) => {
    const byWork = checkpointCount(b) - checkpointCount(a);
    if (byWork !== 0) return byWork;
    const byPhotos = (b.photos?.length ?? 0) - (a.photos?.length ?? 0);
    if (byPhotos !== 0) return byPhotos;
    const seqA = a.importSequenceNumber ?? Number.POSITIVE_INFINITY;
    const seqB = b.importSequenceNumber ?? Number.POSITIVE_INFINITY;
    if (seqA !== seqB) return seqA - seqB;
    return a.id.localeCompare(b.id);
  })[0];
}

/** First non-empty value across the group, so one blank row can't blank out the card. */
function firstNonEmpty(records: InventoryPart[], key: 'description' | 'manufacturer'): string {
  return records.find((r) => !!r[key])?.[key] ?? '';
}

function minNumber(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  return nums.length ? Math.min(...nums) : null;
}

function maxNumber(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  return nums.length ? Math.max(...nums) : null;
}

export function groupPartsBySku(parts: InventoryPart[]): PartGroup[] {
  const bySku = new Map<string, InventoryPart[]>();
  for (const p of parts) {
    const existing = bySku.get(p.sku);
    if (existing) existing.push(p);
    else bySku.set(p.sku, [p]);
  }

  const groups: PartGroup[] = [];
  for (const [sku, records] of bySku) {
    const primary = pickPrimary(records);
    const photos = records.flatMap((r) => r.photos ?? []);

    // Only the counted locations contribute to the confirmed total. Treating an uncounted
    // location as zero would manufacture a shortage the moment one of several bins is done.
    const counted = records.filter((r) => r.confirmedQoh !== null && r.confirmedQoh !== undefined);
    const confirmedQoh = counted.length === 0 ? null : counted.reduce((sum, r) => sum + (r.confirmedQoh ?? 0), 0);
    const qoh = records.reduce((sum, r) => sum + (r.qoh ?? 0), 0);
    const stockQty = records.reduce((sum, r) => sum + (r.confirmedQoh ?? r.qoh ?? 0), 0);
    const expectedForCounted = counted.reduce((sum, r) => sum + (r.qoh ?? 0), 0);

    groups.push({
      sku,
      id: primary.id,
      records,
      primary,
      locations: records.map(toLocation),
      description: firstNonEmpty(records, 'description'),
      manufacturer: firstNonEmpty(records, 'manufacturer'),
      inventorySite: primary.inventorySite,
      binLocation: primary.binLocation,
      newBinLocation: records.find((r) => !!r.newBinLocation)?.newBinLocation,
      qoh,
      stockQty,
      confirmedQoh,
      expectedForCounted,
      photos,
      workflowStatus: deriveStatus({
        photographed: records.some((r) => r.photographed),
        confirmedQoh,
        boxCondition: records.find((r) => !!r.boxCondition)?.boxCondition,
        transferredToMarketRecovery: records.some((r) => r.transferredToMarketRecovery),
        itemListed: records.some((r) => r.itemListed),
        photos,
      }),
      needsReview: records.some((r) => r.needsReview === true),
      needsReviewNote: records.find((r) => !!r.needsReviewNote)?.needsReviewNote,
      photographed: records.some((r) => r.photographed),
      boxCondition: records.find((r) => !!r.boxCondition)?.boxCondition,
      itemCondition: records.find((r) => !!r.itemCondition)?.itemCondition,
      transferredToMarketRecovery: records.some((r) => r.transferredToMarketRecovery),
      itemListed: records.some((r) => r.itemListed),
      // Rank 1 is the best, so the strongest row wins with a minimum; money figures are
      // better when larger.
      revenuePriorityRank: minNumber(records.map((r) => r.revenuePriorityRank)),
      fieldReviewPriority: records
        .map((r) => r.fieldReviewPriority)
        .filter((v): v is string => !!v)
        .sort()[0],
      activeRecoveryPriceBasis: maxNumber(records.map((r) => r.activeRecoveryPriceBasis)),
      expectedGrossRecoveryMargin: maxNumber(records.map((r) => r.expectedGrossRecoveryMargin)),
      grossMarginStatus: records.some((r) => r.grossMarginStatus === 'Positive Gross Margin')
        ? 'Positive Gross Margin'
        : records.find((r) => !!r.grossMarginStatus)?.grossMarginStatus,
    });
  }
  return groups;
}

/**
 * Variance for a whole SKU, judged against only the locations that were actually counted
 * so a part-way count doesn't read as a shortage.
 */
export function getGroupDiscrepancy(group: Pick<PartGroup, 'confirmedQoh' | 'expectedForCounted'>) {
  return getDiscrepancy({ qoh: group.expectedForCounted, confirmedQoh: group.confirmedQoh });
}
