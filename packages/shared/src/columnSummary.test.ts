import { describe, expect, it } from 'vitest';
import { columnSummary } from './columnSummary.js';
import { groupPartsBySku } from './grouping.js';
import { indexSales } from './sales.js';
import type { InventoryPart, Photo } from './types.js';

const NOW = new Date('2026-09-22T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function part(over: Partial<InventoryPart> = {}): InventoryPart {
  return {
    id: over.sku ? `id-${over.sku}` : 'id-1',
    sku: 'SKU-1',
    description: 'A PART',
    manufacturer: 'Parker',
    inventorySite: 'NDPARTS',
    binLocation: 'C-4-5',
    qoh: 2,
    photographed: false,
    photos: [] as Photo[],
    itemListed: false,
    transferredToMarketRecovery: false,
    activeRecoveryPriceBasis: 100,
    updatedAt: daysAgo(1),
    ...over,
  } as unknown as InventoryPart;
}

const summarise = (parts: InventoryPart[], status: 'NotStarted' | 'Processing' | 'Listed' = 'Processing') =>
  columnSummary(status, groupPartsBySku(parts), indexSales([]), new Map(), NOW);

describe('columnSummary', () => {
  it('totals parts, stock rows, quantity and value', () => {
    const s = summarise([
      part({ sku: 'A', qoh: 2, activeRecoveryPriceBasis: 100 }),
      part({ sku: 'A', id: 'id-A2', binLocation: 'D-1-1', qoh: 3, activeRecoveryPriceBasis: 100 }),
      part({ sku: 'B', qoh: 1, activeRecoveryPriceBasis: 50 }),
    ]);
    expect(s).toMatchObject({ parts: 2, records: 3, qoh: 6 });
    // A is 100 x 5 on hand, B is 50 x 1.
    expect(s.value).toBe(550);
  });

  it('counts parts carried at nothing, which the value leaves out', () => {
    const s = summarise([part({ sku: 'A', activeRecoveryPriceBasis: null })]);
    expect(s).toMatchObject({ unpriced: 1, value: 0 });
  });

  it('bands parts by how many checkpoints are done', () => {
    const s = summarise([
      part({ sku: 'A' }),
      part({ sku: 'B', photographed: true, photos: [{ id: 'p', url: '/u', name: 'n' }] as Photo[] }),
      part({ sku: 'C', photographed: true, photos: [{ id: 'p', url: '/u', name: 'n' }] as Photo[], confirmedQoh: 1 }),
    ]);
    expect(s.progress.map((p) => p.parts)).toEqual([1, 1, 1, 0, 0, 0]);
    expect(s.tasks.find((t) => t.key === 'photographed')?.parts).toBe(2);
    expect(s.tasks.find((t) => t.key === 'qtyConfirmed')?.parts).toBe(1);
  });

  it('bands parts by how long since anyone touched them', () => {
    const s = summarise([
      part({ sku: 'A', updatedAt: daysAgo(2) }),
      part({ sku: 'B', updatedAt: daysAgo(20) }),
      part({ sku: 'C', updatedAt: daysAgo(200) }),
    ]);
    expect(s.ageBands.map((b) => `${b.label}:${b.parts}`)).toEqual([
      'Under a week:1',
      '1–4 weeks:1',
      '1–3 months:0',
      'Over 3 months:1',
    ]);
    expect(s).toMatchObject({ oldestDays: 200, medianDays: 20 });
  });

  it('takes the newest stamp on a part, photographs included', () => {
    const s = summarise([
      part({
        sku: 'A',
        updatedAt: daysAgo(90),
        photos: [{ id: 'p', url: '/u', name: 'n', uploadedAt: daysAgo(3) }] as Photo[],
      }),
    ]);
    expect(s.oldestDays).toBe(3);
  });

  it('counts flagged parts and counted-but-mismatched quantities', () => {
    const s = summarise([
      part({ sku: 'A', needsReview: true }),
      part({ sku: 'B', qoh: 5, confirmedQoh: 3 }),
      part({ sku: 'C', qoh: 5, confirmedQoh: 5 }),
    ]);
    expect(s).toMatchObject({ needsReview: 1, discrepancies: 1 });
  });

  it('breaks the column down by site, busiest first', () => {
    const s = summarise([
      part({ sku: 'A', inventorySite: 'NDFMC' }),
      part({ sku: 'B', inventorySite: 'NDPARTS' }),
      part({ sku: 'C', inventorySite: 'NDPARTS' }),
    ]);
    expect(s.sites.map((x) => `${x.site}:${x.parts}`)).toEqual(['NDPARTS:2', 'NDFMC:1']);
  });

  it('leaves listing figures out except on the eBay column', () => {
    expect(summarise([part({ sku: 'A' })]).listings).toBeNull();
    expect(summarise([part({ sku: 'A', itemListed: true })], 'Listed').listings).toMatchObject({ live: 1 });
  });

  it('says nothing about age when no part carries a date', () => {
    const s = summarise([part({ sku: 'A', updatedAt: undefined, catalogingStartDate: null })]);
    expect(s).toMatchObject({ oldestDays: null, medianDays: null });
  });
});
