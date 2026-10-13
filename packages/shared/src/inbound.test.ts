import { describe, expect, it } from 'vitest';
import { averageUnitCost, cratesOf, nextCrateLabel, normalizeCrate, originCode, type InboundItem } from './inbound.js';

const item = (over: Partial<InboundItem>): InboundItem => ({
  id: 'x',
  origin: 'Grand Junction',
  sourceKey: 'A|GJPARTS',
  sku: 'A',
  description: '',
  manufacturer: '',
  originSite: 'GJPARTS',
  originBin: 'A-1',
  qty: 1,
  unitCost: null,
  status: 'awaiting',
  crate: '',
  packedAt: null,
  packedBy: '',
  shippedAt: null,
  shippedBy: '',
  receivedAt: null,
  receivedBy: '',
  receivedQty: null,
  transferId: '',
  partId: '',
  importedAt: null,
  ...over,
});

describe('average unit cost', () => {
  it('divides the total by the quantity, to the cent', () => {
    // 23 transferred at $0 and three bought in at $0.99: $3 across 26.
    expect(averageUnitCost(3, 26)).toBe(0.12);
    expect(averageUnitCost(1379, 6)).toBe(229.83);
  });

  it('has none without a quantity or a value', () => {
    expect(averageUnitCost(5, 0)).toBeNull();
    expect(averageUnitCost(null, 3)).toBeNull();
  });
});

describe('crates', () => {
  it('are numbered under the origin’s initials, one past the highest', () => {
    expect(originCode('Grand Junction')).toBe('GJ');
    expect(nextCrateLabel([], 'Grand Junction')).toBe('GJ-001');
    expect(nextCrateLabel([item({ crate: 'GJ-002' }), item({ crate: 'GJ-010' })], 'Grand Junction')).toBe('GJ-011');
    expect(normalizeCrate(' gj-3 ')).toBe('GJ-3');
  });

  it('gather their items, and take the status of the least-advanced one', () => {
    const crates = cratesOf([
      item({ id: '1', crate: 'GJ-001', status: 'shipped', qty: 2, shippedAt: '2026-10-11' }),
      item({ id: '2', crate: 'GJ-001', status: 'received', qty: 3 }),
      item({ id: '3', crate: 'GJ-002', status: 'packed', qty: 1, packedAt: '2026-10-12' }),
      item({ id: '4', status: 'awaiting' }),
    ]);
    expect(crates.map((c) => [c.label, c.status, c.items.length, c.units])).toEqual([
      ['GJ-002', 'packed', 1, 1],
      ['GJ-001', 'shipped', 2, 5],
    ]);
  });
});
