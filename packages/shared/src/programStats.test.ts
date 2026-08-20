import { describe, expect, it } from 'vitest';
import { groupPartsBySku } from './grouping.js';
import {
  catalogueValue,
  computeDiscrepancyTotals,
  computeProgramTotals,
  extendedValue,
  percentOf,
} from './programStats.js';
import type { DiscrepancyLogEntry } from './discrepancy.js';
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
    expect(computeProgramTotals([])).toEqual({
      added: 0,
      photographed: 0,
      listed: 0,
      completed: 0,
      recoveryValue: 0,
    });
  });
});

describe('computeProgramTotals over a period', () => {
  const NOW = new Date('2026-08-20T18:00:00Z');
  const photo = (uploadedAt: string) => ({ fileId: 'f', fileName: 'n', url: 'u', uploadedAt });

  it('counts a part as added in the period its row was created', () => {
    const groups = groupPartsBySku([
      part({ id: 'a', sku: 'X1', createdAt: '2026-08-20T14:00:00Z' }),
      part({ id: 'b', sku: 'X2', createdAt: '2026-07-02T14:00:00Z' }),
    ]);
    expect(computeProgramTotals(groups, 'day', NOW).added).toBe(1);
    expect(computeProgramTotals(groups, 'month', NOW).added).toBe(1);
    expect(computeProgramTotals(groups, 'all', NOW).added).toBe(2);
  });

  it('dates a photographed part by its first photo, not its latest', () => {
    // First shot last month, a top-up today: the part was not photographed today.
    const groups = groupPartsBySku([
      part({
        id: 'a',
        sku: 'X1',
        photographed: true,
        photos: [photo('2026-08-20T15:00:00Z'), photo('2026-07-10T15:00:00Z')],
      }),
    ]);
    expect(computeProgramTotals(groups, 'day', NOW).photographed).toBe(0);
    expect(computeProgramTotals(groups, 'all', NOW).photographed).toBe(1);
  });

  it('counts listings by their listing date', () => {
    const groups = groupPartsBySku([
      part({ id: 'a', sku: 'X1', itemListed: true, itemListedDate: '2026-08-20T00:00:00Z' }),
      part({ id: 'b', sku: 'X2', itemListed: true, itemListedDate: '2026-01-05T00:00:00Z' }),
    ]);
    expect(computeProgramTotals(groups, 'day', NOW).listed).toBe(1);
    expect(computeProgramTotals(groups, 'all', NOW).listed).toBe(2);
  });

  it('only counts a period completion when the part is actually finished', () => {
    const listedToday = { itemListed: true, itemListedDate: '2026-08-20T00:00:00Z' };
    const groups = groupPartsBySku([
      // Listed today and finished.
      part({
        id: 'a',
        sku: 'X1',
        ...listedToday,
        photographed: true,
        confirmedQoh: 1,
        boxCondition: 'Good',
        transferredToMarketRecovery: true,
      }),
      // Listed today but nothing else done.
      part({ id: 'b', sku: 'X2', ...listedToday }),
    ]);
    const today = computeProgramTotals(groups, 'day', NOW);
    expect(today.listed).toBe(2);
    expect(today.completed).toBe(1);
  });

  it('leaves undated legacy rows out of period counts but keeps them in the total', () => {
    // Nothing imported before createdAt existed carries a creation date.
    const groups = groupPartsBySku([part({ id: 'a', sku: 'X1' }), part({ id: 'b', sku: 'X2' })]);
    expect(computeProgramTotals(groups, 'month', NOW).added).toBe(0);
    expect(computeProgramTotals(groups, 'all', NOW).added).toBe(2);
  });
});

describe('recovery value', () => {
  it('totals the value of listed parts only', () => {
    const groups = groupPartsBySku([
      part({ id: 'a', sku: 'X1', itemListed: true, activeRecoveryPriceBasis: 100, qoh: 1 }),
      part({ id: 'b', sku: 'X2', activeRecoveryPriceBasis: 250, qoh: 1 }),
    ]);
    expect(computeProgramTotals(groups, 'all').recoveryValue).toBe(100);
    expect(catalogueValue(groups)).toBe(350);
  });

  it('multiplies the unit price by the quantity on hand', () => {
    // The basis is per unit: eleven in the bin at $44.99 is worth $494.89, not $44.99.
    const [g] = groupPartsBySku([
      part({ id: 'a', sku: 'X1', itemListed: true, activeRecoveryPriceBasis: 44.99, qoh: 11 }),
    ]);
    expect(extendedValue(g)).toBeCloseTo(494.89, 2);
    expect(computeProgramTotals([g], 'all').recoveryValue).toBeCloseTo(494.89, 2);
  });

  it('applies one SKU basis across its combined quantity, not once per row', () => {
    const groups = groupPartsBySku([
      part({ id: 'a', sku: 'X1', itemListed: true, activeRecoveryPriceBasis: 100, qoh: 2 }),
      part({ id: 'b', sku: 'X1', activeRecoveryPriceBasis: 100, qoh: 3 }),
    ]);
    expect(computeProgramTotals(groups, 'all').recoveryValue).toBe(500);
  });
});

describe('computeDiscrepancyTotals', () => {
  const NOW = new Date('2026-08-20T18:00:00Z');
  const entry = (over: Partial<DiscrepancyLogEntry>): DiscrepancyLogEntry => ({
    sku: 'X1',
    inventorySite: 'NDPARTS',
    binLocation: 'A-1-1',
    expectedQoh: 5,
    countedQoh: 3,
    variance: -2,
    kind: 'shortage',
    user: 'someone',
    recordedAt: '2026-08-20T14:00:00Z',
    ...over,
  });

  it('sums the variance across distinct SKUs', () => {
    const totals = computeDiscrepancyTotals(
      [entry({ sku: 'X1', variance: -2 }), entry({ sku: 'X2', variance: 1 })],
      'all',
      NOW
    );
    expect(totals).toEqual({ skus: 2, netUnits: -1 });
  });

  it('counts a recounted SKU once, taking its latest entry', () => {
    const totals = computeDiscrepancyTotals(
      [
        entry({ sku: 'X1', variance: -5, recordedAt: '2026-08-18T10:00:00Z' }),
        entry({ sku: 'X1', variance: -1, recordedAt: '2026-08-20T10:00:00Z' }),
      ],
      'all',
      NOW
    );
    expect(totals).toEqual({ skus: 1, netUnits: -1 });
  });

  it('restricts to the selected window', () => {
    const log = [
      entry({ sku: 'X1', recordedAt: '2026-08-20T14:00:00Z' }),
      entry({ sku: 'X2', recordedAt: '2026-05-01T14:00:00Z' }),
    ];
    expect(computeDiscrepancyTotals(log, 'day', NOW).skus).toBe(1);
    expect(computeDiscrepancyTotals(log, 'all', NOW).skus).toBe(2);
  });

  it('is empty when nothing has been counted', () => {
    expect(computeDiscrepancyTotals([], 'all', NOW)).toEqual({ skus: 0, netUnits: 0 });
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
