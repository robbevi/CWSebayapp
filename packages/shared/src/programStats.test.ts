import { describe, expect, it } from 'vitest';
import { groupPartsBySku } from './grouping.js';
import { computeProgramTotals, percentOf } from './programStats.js';
import type { InventoryPart } from './types.js';

function part(over: Partial<InventoryPart> & { sku: string; id: string }): InventoryPart {
  return {
    description: '',
    manufacturer: '',
    inventorySite: 'NDPARTS',
    binLocation: '',
    qoh: 1,
    confirmedQoh: null,
    photographed: false,
    itemListed: false,
    transferredToMarketRecovery: false,
    photos: [],
    workflowStatus: 'NotStarted',
    ...over,
  };
}

const complete = (sku: string, id: string) =>
  part({
    sku,
    id,
    photographed: true,
    confirmedQoh: 1,
    boxCondition: 'Good',
    transferredToMarketRecovery: true,
    itemListed: true,
  });

describe('computeProgramTotals', () => {
  it('counts per SKU, not per row', () => {
    const totals = computeProgramTotals(
      groupPartsBySku([
        part({ id: 'a', sku: 'X1', binLocation: 'A' }),
        part({ id: 'b', sku: 'X1', binLocation: 'B' }),
        part({ id: 'c', sku: 'X2' }),
      ])
    );
    expect(totals.added).toBe(2);
  });

  it('credits a SKU when any of its rows carries the work', () => {
    const totals = computeProgramTotals(
      groupPartsBySku([
        part({ id: 'a', sku: 'X1' }),
        part({ id: 'b', sku: 'X1', photographed: true }),
      ])
    );
    expect(totals.photographed).toBe(1);
  });

  it('counts listed and completed separately', () => {
    const totals = computeProgramTotals(
      groupPartsBySku([complete('X1', 'a'), part({ id: 'b', sku: 'X2', itemListed: true })])
    );
    expect(totals.added).toBe(2);
    expect(totals.listed).toBe(2);
    // X2 is listed but has no photos, count or condition, so it is not finished.
    expect(totals.completed).toBe(1);
  });

  it('is all zeroes on an empty catalogue', () => {
    expect(computeProgramTotals([])).toEqual({ added: 0, photographed: 0, listed: 0, completed: 0 });
  });
});

describe('percentOf', () => {
  it('rounds to whole percents', () => {
    expect(percentOf(228, 2049)).toBe('11%');
  });

  it('keeps a trace of progress visible instead of rounding it to nothing', () => {
    expect(percentOf(2, 2049)).toBe('<1%');
  });

  it('does not divide by zero', () => {
    expect(percentOf(0, 0)).toBe('0%');
  });
});
