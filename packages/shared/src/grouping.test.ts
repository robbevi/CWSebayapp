import { describe, expect, it } from 'vitest';
import { getGroupDiscrepancy, groupPartsBySku } from './grouping.js';
import type { InventoryPart } from './types.js';

function part(over: Partial<InventoryPart> & { sku: string; id: string }): InventoryPart {
  return {
    description: '',
    manufacturer: '',
    inventorySite: 'NDPARTS',
    binLocation: '',
    qoh: 0,
    confirmedQoh: null,
    photographed: false,
    itemListed: false,
    transferredToMarketRecovery: false,
    photos: [],
    workflowStatus: 'NotStarted',
    ...over,
  };
}

describe('groupPartsBySku', () => {
  it('folds every row for a SKU into one group and keeps each location', () => {
    const groups = groupPartsBySku([
      part({ id: 'a', sku: 'X1', inventorySite: 'NDPARTS', binLocation: 'PAL5-4', qoh: 6 }),
      part({ id: 'b', sku: 'X1', inventorySite: 'USEXMIR', binLocation: 'M-2-2', qoh: 2 }),
      part({ id: 'c', sku: 'X2', binLocation: 'A-1-1', qoh: 1 }),
    ]);
    expect(groups).toHaveLength(2);
    const x1 = groups.find((g) => g.sku === 'X1')!;
    expect(x1.locations.map((l) => l.binLocation)).toEqual(['PAL5-4', 'M-2-2']);
    expect(x1.qoh).toBe(8);
  });

  it('unions photos across locations', () => {
    const photo = { fileId: 'f', fileName: 'n', url: 'u', uploadedAt: '' };
    const [g] = groupPartsBySku([
      part({ id: 'a', sku: 'X1', photos: [photo] }),
      part({ id: 'b', sku: 'X1', photos: [{ ...photo, fileId: 'g' }] }),
    ]);
    expect(g.photos).toHaveLength(2);
  });

  it('gathers photos from a row that is not the primary', () => {
    // The regression: the row with the most checkpoints becomes primary, and it is often
    // not the row somebody photographed. Reading photos off the primary alone showed a
    // part as photographed with nothing to see.
    const photo = { fileId: 'f', fileName: 'n', url: 'u', uploadedAt: '' };
    const [g] = groupPartsBySku([
      part({ id: 'photographed-row', sku: 'X1', photographed: true, photos: [photo] }),
      part({ id: 'busier-row', sku: 'X1', boxCondition: 'Good', transferredToMarketRecovery: true }),
    ]);
    expect(g.primary.id).toBe('busier-row');
    expect(g.primary.photos).toHaveLength(0);
    expect(g.photos).toHaveLength(1);
  });

  it('counts a checkpoint as done when any location has it', () => {
    const [g] = groupPartsBySku([
      part({ id: 'a', sku: 'X1', photographed: true }),
      part({ id: 'b', sku: 'X1', boxCondition: 'Good' }),
    ]);
    expect(g.workflowStatus).toBe('Processing');
  });

  it('gives SKU-level work to the record that has the most progress', () => {
    const [g] = groupPartsBySku([
      part({ id: 'a', sku: 'X1' }),
      part({ id: 'b', sku: 'X1', photographed: true, boxCondition: 'Good' }),
    ]);
    expect(g.primary.id).toBe('b');
    expect(g.id).toBe('b');
  });

  it('picks the same primary regardless of row order', () => {
    const rows = [
      part({ id: 'a', sku: 'X1', importSequenceNumber: 2 }),
      part({ id: 'b', sku: 'X1', importSequenceNumber: 1 }),
    ];
    expect(groupPartsBySku(rows)[0].primary.id).toBe('b');
    expect(groupPartsBySku([...rows].reverse())[0].primary.id).toBe('b');
  });

  it('falls back to a populated row for description and manufacturer', () => {
    const [g] = groupPartsBySku([
      part({ id: 'a', sku: 'X1' }),
      part({ id: 'b', sku: 'X1', description: 'Seal kit', manufacturer: 'Acme' }),
    ]);
    expect(g.description).toBe('Seal kit');
    expect(g.manufacturer).toBe('Acme');
  });

  it('leaves the confirmed total null until something has been counted', () => {
    const [g] = groupPartsBySku([part({ id: 'a', sku: 'X1', qoh: 4 }), part({ id: 'b', sku: 'X1', qoh: 2 })]);
    expect(g.confirmedQoh).toBeNull();
    expect(getGroupDiscrepancy(g)).toBeNull();
  });

  it('judges a partial count against only the counted locations', () => {
    // 6 expected in the counted bin and 6 found there — the other, uncounted bin of 2 must
    // not turn a clean count into a -2 shortage.
    const [g] = groupPartsBySku([
      part({ id: 'a', sku: 'X1', qoh: 6, confirmedQoh: 6 }),
      part({ id: 'b', sku: 'X1', qoh: 2 }),
    ]);
    expect(g.qoh).toBe(8);
    expect(g.expectedForCounted).toBe(6);
    expect(getGroupDiscrepancy(g)).toEqual({ variance: 0, kind: 'none' });
  });

  it('adds up a real shortage across counted locations', () => {
    const [g] = groupPartsBySku([
      part({ id: 'a', sku: 'X1', qoh: 6, confirmedQoh: 5 }),
      part({ id: 'b', sku: 'X1', qoh: 2, confirmedQoh: 1 }),
    ]);
    expect(getGroupDiscrepancy(g)).toEqual({ variance: -2, kind: 'shortage' });
  });

  it('believes the counted quantity for counted bins and the system for the rest', () => {
    // Six counted as five, plus an uncounted bin of two: five on that shelf and two
    // presumed on the other, not five in total and not eight.
    const [g] = groupPartsBySku([
      part({ id: 'a', sku: 'X1', qoh: 6, confirmedQoh: 5 }),
      part({ id: 'b', sku: 'X1', qoh: 2 }),
    ]);
    expect(g.qoh).toBe(8);
    expect(g.stockQty).toBe(7);
  });

  it('matches the system quantity when nothing has been counted', () => {
    const [g] = groupPartsBySku([part({ id: 'a', sku: 'X1', qoh: 4 })]);
    expect(g.stockQty).toBe(4);
  });

  it('flags the group when any location needs review', () => {
    const [g] = groupPartsBySku([
      part({ id: 'a', sku: 'X1' }),
      part({ id: 'b', sku: 'X1', needsReview: true }),
    ]);
    expect(g.needsReview).toBe(true);
  });
});
