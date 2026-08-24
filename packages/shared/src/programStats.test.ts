import { describe, expect, it } from 'vitest';
import { groupPartsBySku } from './grouping.js';
import {
  catalogueValue,
  computeDiscrepancyTotals,
  computeProgramTotals,
  computeSalesTotalsSplit,
  computeStandingValue,
  extendedValue,
  percentOf,
} from './programStats.js';
import type { DiscrepancyLogEntry } from './discrepancy.js';
import type { Sale } from './sales.js';
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

describe('computeStandingValue', () => {
  const sale = (over: Partial<Sale> & { lineItemId: string }): Sale => ({
    orderId: 'o1',
    soldAt: '2026-08-20T12:00:00Z',
    ebayListingId: '111',
    sku: 'X1',
    qtySold: 1,
    grossSale: 100,
    shipping: 0,
    tax: 0,
    fees: 10,
    netProceeds: 90,
    currency: 'USD',
    feesEstimated: false,
    syncedAt: '2026-08-20T13:00:00Z',
    ...over,
  });

  it('values all stock when nothing has sold', () => {
    const groups = groupPartsBySku([
      part({ id: 'a', sku: 'X1', activeRecoveryPriceBasis: 50, qoh: 4 }),
    ]);
    expect(computeStandingValue(groups, []).potential).toBeCloseTo(200, 2);
  });

  it('draws down as units sell rather than staying at the catalogue total', () => {
    const groups = groupPartsBySku([
      part({ id: 'a', sku: 'X1', activeRecoveryPriceBasis: 50, qoh: 4, ebayListingId: '111' }),
    ]);
    // One of four gone leaves three on the shelf.
    const value = computeStandingValue(groups, [sale({ lineItemId: 's1', qtySold: 1 })]);
    expect(value.potential).toBeCloseTo(150, 2);
  });

  it('reaches zero once a listing is exhausted', () => {
    const groups = groupPartsBySku([
      part({ id: 'a', sku: 'X1', activeRecoveryPriceBasis: 50, qoh: 2, ebayListingId: '111' }),
    ]);
    expect(computeStandingValue(groups, [sale({ lineItemId: 's1', qtySold: 2 })]).potential).toBe(0);
  });

  it('takes a SKU expected margin once, not once per row', () => {
    const groups = groupPartsBySku([
      part({ id: 'a', sku: 'X1', expectedGrossRecoveryMargin: 429.89 }),
      part({ id: 'b', sku: 'X1', expectedGrossRecoveryMargin: 429.89 }),
    ]);
    expect(computeStandingValue(groups, []).expectedMargin).toBeCloseTo(429.89, 2);
  });

  it('counts the parts that cost more than they will fetch', () => {
    const groups = groupPartsBySku([
      part({ id: 'a', sku: 'X1', expectedGrossRecoveryMargin: -21.02 }),
      part({ id: 'b', sku: 'X2', expectedGrossRecoveryMargin: 130.65 }),
    ]);
    const value = computeStandingValue(groups, []);
    expect(value.underwaterSkus).toBe(1);
    expect(value.expectedMargin).toBeCloseTo(109.63, 2);
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

describe('computeSalesTotalsSplit', () => {
  const s = (over: Partial<Sale> & { lineItemId: string }): Sale => ({
    orderId: 'o', soldAt: '2026-08-20T12:00:00Z', ebayListingId: '', sku: '', qtySold: 1,
    grossSale: 100, shipping: 0, tax: 0, fees: 10, netProceeds: 90, currency: 'USD',
    feesEstimated: false, syncedAt: '', ...over,
  });

  const groups = groupPartsBySku([part({ id: 'a', sku: 'X1', ebayListingId: '3982' })]);

  it('separates revenue with a part behind it from revenue without', () => {
    const split = computeSalesTotalsSplit(
      [
        s({ lineItemId: '1', ebayListingId: '3982', grossSale: 1260, netProceeds: 1102 }),
        s({ lineItemId: '2', ebayListingId: '3977', grossSale: 400, netProceeds: 355 }),
      ],
      groups,
      'all'
    );
    expect(split.tracked.net).toBe(1102);
    expect(split.untracked.net).toBe(355);
  });

  it('always reconciles: tracked plus untracked equals the whole', () => {
    const sales = [
      s({ lineItemId: '1', ebayListingId: '3982', netProceeds: 1102, qtySold: 1 }),
      s({ lineItemId: '2', ebayListingId: '3977', netProceeds: 355, qtySold: 2 }),
      s({ lineItemId: '3', sku: 'X1', netProceeds: 40, qtySold: 3 }),
    ];
    const split = computeSalesTotalsSplit(sales, groups, 'all');
    expect(split.tracked.net + split.untracked.net).toBe(split.all.net);
    expect(split.tracked.qty + split.untracked.qty).toBe(split.all.qty);
  });

  it('applies the period to both halves', () => {
    const NOW = new Date('2026-08-20T18:00:00Z');
    const sales = [
      s({ lineItemId: '1', ebayListingId: '3982', soldAt: '2026-08-20T10:00:00Z' }),
      s({ lineItemId: '2', ebayListingId: '3977', soldAt: '2026-03-12T10:00:00Z' }),
    ];
    const today = computeSalesTotalsSplit(sales, groups, 'day', NOW);
    expect(today.tracked.orders).toBe(1);
    expect(today.untracked.orders).toBe(0);
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
