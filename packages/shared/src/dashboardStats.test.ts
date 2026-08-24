import { describe, expect, it } from 'vitest';
import { computeDashboardStats, daysListed, formatDate } from './dashboardStats.js';
import { groupPartsBySku } from './grouping.js';
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

// A Thursday, so "this week" runs from Monday the 17th.
const NOW = new Date('2026-08-20T18:00:00Z');
const listed = (date: string) => ({ itemListed: true, itemListedDate: `${date}T00:00:00.000Z` });

describe('computeDashboardStats', () => {
  it('counts items by SKU and records by row', () => {
    const stats = computeDashboardStats(
      groupPartsBySku([
        part({ id: 'a', sku: 'X1', binLocation: 'A', qoh: 6 }),
        part({ id: 'b', sku: 'X1', binLocation: 'B', qoh: 2 }),
        part({ id: 'c', sku: 'X2', qoh: 1 }),
      ]),
      [],
      NOW
    );
    expect(stats.totalItems).toBe(2);
    expect(stats.totalRecords).toBe(3);
    expect(stats.totalQoh).toBe(9);
  });

  it('splits listings into this week and last', () => {
    const stats = computeDashboardStats(
      groupPartsBySku([
        part({ id: 'a', sku: 'X1', ...listed('2026-08-18') }),
        part({ id: 'b', sku: 'X2', ...listed('2026-08-20') }),
        part({ id: 'c', sku: 'X3', ...listed('2026-08-12') }),
        part({ id: 'd', sku: 'X4', ...listed('2026-08-13') }),
      ]),
      [],
      NOW
    );
    expect(stats.listedThisWeek).toBe(2);
    expect(stats.listedLastWeek).toBe(2);
    expect(stats.listedDeltaPct).toBe(0);
  });

  it('reports the change as a percentage of last week', () => {
    const rows = [
      part({ id: 'a', sku: 'X1', ...listed('2026-08-18') }),
      part({ id: 'b', sku: 'X2', ...listed('2026-08-11') }),
      part({ id: 'c', sku: 'X3', ...listed('2026-08-12') }),
      part({ id: 'd', sku: 'X4', ...listed('2026-08-13') }),
      part({ id: 'e', sku: 'X5', ...listed('2026-08-14') }),
    ];
    // One this week against four last week.
    expect(computeDashboardStats(groupPartsBySku(rows), [], NOW).listedDeltaPct).toBe(-75);
  });

  it('gives no percentage when last week had no listings', () => {
    const stats = computeDashboardStats(
      groupPartsBySku([part({ id: 'a', sku: 'X1', ...listed('2026-08-18') })]),
      [],
      NOW
    );
    expect(stats.listedThisWeek).toBe(1);
    expect(stats.listedDeltaPct).toBeNull();
  });

  it('dates a listing by its calendar date, not a timezone-shifted one', () => {
    // Stored at UTC midnight on Monday. Converting through Chicago would move it into the
    // previous week and make this week's count wrong.
    const stats = computeDashboardStats(
      groupPartsBySku([part({ id: 'a', sku: 'X1', ...listed('2026-08-17') })]),
      [],
      NOW
    );
    expect(stats.listedThisWeek).toBe(1);
  });

  it('values listed stock by quantity and counts flagged parts', () => {
    const stats = computeDashboardStats(
      groupPartsBySku([
        part({ id: 'a', sku: 'X1', ...listed('2026-08-18'), activeRecoveryPriceBasis: 50, qoh: 3 }),
        part({ id: 'b', sku: 'X2', needsReview: true, activeRecoveryPriceBasis: 20, qoh: 1 }),
      ]),
      [],
      NOW
    );
    expect(stats.listedValue).toBeCloseTo(150, 2);
    expect(stats.estRecoveryValue).toBeCloseTo(170, 2);
    expect(stats.needsReview).toBe(1);
  });
});

describe('daysListed', () => {
  it('counts whole days since the listing date', () => {
    expect(daysListed('2026-08-13T00:00:00.000Z', NOW)).toBe(7);
  });

  it('is zero on the day it was listed', () => {
    expect(daysListed('2026-08-20T00:00:00.000Z', NOW)).toBe(0);
  });

  it('is null when the part was never listed', () => {
    expect(daysListed(null, NOW)).toBeNull();
    expect(daysListed(undefined, NOW)).toBeNull();
  });
});

describe('formatDate', () => {
  it('reads MM-DD-YYYY off an ISO date', () => {
    expect(formatDate('2026-08-20')).toBe('08-20-2026');
  });

  it('ignores any time portion', () => {
    expect(formatDate('2026-08-20T22:43:02.000Z')).toBe('08-20-2026');
  });

  it('does not shift a date stored at UTC midnight', () => {
    // Through a US timezone this would land on the 19th, which is the bug this avoids.
    expect(formatDate('2026-08-20T00:00:00.000Z')).toBe('08-20-2026');
  });

  it('shows a dash for nothing', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('shows a dash rather than mangling an unrecognised value', () => {
    expect(formatDate('20 August 2026')).toBe('—');
  });
});
