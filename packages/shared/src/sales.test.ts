import { describe, expect, it } from 'vitest';
import { groupPartsBySku } from './grouping.js';
import { indexSales, salesForGroup, soldPosition, totalsFor, type Sale } from './sales.js';
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

function sale(over: Partial<Sale> & { lineItemId: string }): Sale {
  return {
    orderId: 'o1',
    soldAt: '2026-08-20T12:00:00Z',
    ebayListingId: '398221002764',
    sku: 'X1',
    qtySold: 1,
    grossSale: 100,
    shipping: 10,
    tax: 8,
    fees: 15,
    netProceeds: 95,
    currency: 'USD',
    feesEstimated: false,
    syncedAt: '2026-08-20T13:00:00Z',
    ...over,
  };
}

describe('totalsFor', () => {
  it('adds up quantity, gross and net', () => {
    const totals = totalsFor([
      sale({ lineItemId: 'a', qtySold: 2, grossSale: 100, netProceeds: 85 }),
      sale({ lineItemId: 'b', qtySold: 1, grossSale: 50, netProceeds: 42 }),
    ]);
    expect(totals).toEqual({ orders: 2, qty: 3, gross: 150, net: 127 });
  });
});

describe('salesForGroup', () => {
  it('matches on the eBay listing id', () => {
    const [g] = groupPartsBySku([part({ id: 'a', sku: 'X1', ebayListingId: '111' })]);
    const sales = salesForGroup(g, indexSales([sale({ lineItemId: 's1', ebayListingId: '111', sku: '' })]));
    expect(sales).toHaveLength(1);
  });

  it('falls back to SKU when a sale carries no listing id', () => {
    const [g] = groupPartsBySku([part({ id: 'a', sku: 'X1' })]);
    const sales = salesForGroup(g, indexSales([sale({ lineItemId: 's1', ebayListingId: '', sku: 'x1' })]));
    expect(sales).toHaveLength(1);
  });

  it('counts a sale once when both the listing id and the SKU match', () => {
    const [g] = groupPartsBySku([part({ id: 'a', sku: 'X1', ebayListingId: '111' })]);
    const sales = salesForGroup(g, indexSales([sale({ lineItemId: 's1', ebayListingId: '111', sku: 'X1' })]));
    expect(sales).toHaveLength(1);
  });

  it('gathers sales across every listing of a grouped SKU', () => {
    const [g] = groupPartsBySku([
      part({ id: 'a', sku: 'X1', ebayListingId: '111' }),
      part({ id: 'b', sku: 'X1', ebayListingId: '222' }),
    ]);
    const sales = salesForGroup(
      g,
      indexSales([
        sale({ lineItemId: 's1', ebayListingId: '111', sku: '' }),
        sale({ lineItemId: 's2', ebayListingId: '222', sku: '' }),
      ])
    );
    expect(sales).toHaveLength(2);
  });

  it('returns newest first', () => {
    const [g] = groupPartsBySku([part({ id: 'a', sku: 'X1', ebayListingId: '111' })]);
    const sales = salesForGroup(
      g,
      indexSales([
        sale({ lineItemId: 'old', soldAt: '2026-01-01T00:00:00Z' }),
        sale({ lineItemId: 'new', soldAt: '2026-08-01T00:00:00Z' }),
      ])
    );
    expect(sales.map((s) => s.lineItemId)).toEqual(['new', 'old']);
  });
});

describe('soldPosition', () => {
  it('reports what is left of a part-sold listing', () => {
    const [g] = groupPartsBySku([part({ id: 'a', sku: 'X1', qoh: 11, ebayListingId: '111' })]);
    const sales = [sale({ lineItemId: 's1', qtySold: 3 })];
    expect(soldPosition(g, sales)).toMatchObject({ soldQty: 3, remainingQty: 8, soldOut: false });
  });

  it('is sold out once every unit is accounted for', () => {
    const [g] = groupPartsBySku([part({ id: 'a', sku: 'X1', qoh: 3, ebayListingId: '111' })]);
    expect(soldPosition(g, [sale({ lineItemId: 's1', qtySold: 3 })]).soldOut).toBe(true);
  });

  it('measures against the counted quantity when there is one', () => {
    // The shelf said 2 even though the system said 11 — selling both is sold out.
    const [g] = groupPartsBySku([part({ id: 'a', sku: 'X1', qoh: 11, confirmedQoh: 2 })]);
    expect(soldPosition(g, [sale({ lineItemId: 's1', qtySold: 2 })])).toMatchObject({
      remainingQty: 0,
      soldOut: true,
    });
  });

  it('never reports negative stock when eBay says more sold than we hold', () => {
    const [g] = groupPartsBySku([part({ id: 'a', sku: 'X1', qoh: 1 })]);
    expect(soldPosition(g, [sale({ lineItemId: 's1', qtySold: 4 })]).remainingQty).toBe(0);
  });

  it('is not sold out when nothing has sold', () => {
    const [g] = groupPartsBySku([part({ id: 'a', sku: 'X1', qoh: 0 })]);
    expect(soldPosition(g, []).soldOut).toBe(false);
  });
});
