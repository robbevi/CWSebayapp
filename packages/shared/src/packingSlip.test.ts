import { describe, expect, it } from 'vitest';
import { packingSlipBody, packingSlipPage, saleNotice } from './packingSlip.js';
import type { ShipOrder } from './sales.js';

const order: ShipOrder = {
  orderId: '12-34567-89012',
  createdAt: '2026-10-07T12:00:00.000Z',
  shipBy: '2026-10-14T04:59:59.000Z',
  buyer: 'buyer1',
  shipTo: { name: 'A <Buyer>', lines: ['1 Main St'], city: 'Madison', state: 'WI', postalCode: '53703', country: 'US', phone: '' },
  service: 'FedExSmartPost',
  items: [
    {
      lineItemId: 'L1',
      ebayListingId: '111',
      sku: '383-0136',
      title: 'Seal',
      quantity: 5,
      part: {
        id: 'p1',
        description: 'SEAL, OIL',
        binLocation: 'C-3-3',
        recoveryBin: 'A-1-3',
        site: 'NDPARTS',
        condition: 'New',
        photoUrl: null,
      },
    },
  ],
};

describe('the packing slip', () => {
  it('says what to pick, from which bin, and where it goes', () => {
    const html = packingSlipBody(order);
    expect(html).toContain('383-0136');
    expect(html).toContain('C-3-3');
    expect(html).toContain('Recovery A-1-3');
    expect(html).toContain('Fed Ex Smart Post');
    // Ship-by is read in Williston's time, not the server's.
    expect(html).toContain('ship by Tue, Oct 13');
  });

  it('escapes what the buyer typed', () => {
    expect(packingSlipBody(order)).toContain('A &lt;Buyer&gt;');
    expect(packingSlipBody(order)).not.toContain('<Buyer>');
  });

  it('prints itself when opened on its own', () => {
    expect(packingSlipPage(order)).toContain('window.print()');
  });
});

describe('the sale notice', () => {
  it('names the sale and the deadline in the subject', () => {
    expect(saleNotice(order).subject).toBe('eBay sale: 5 × 383-0136 — ship by Tue, Oct 13');
  });

  it('links to the label and carries the slip', () => {
    const n = saleNotice(order);
    expect(n.html).toContain('https://www.ebay.com/sh/ord/details?orderid=12-34567-89012');
    expect(n.html).toContain('Packing slip');
    expect(n.text).toContain('5 × 383-0136 — SEAL, OIL — bin C-3-3');
    expect(n.skus).toEqual(['383-0136']);
  });
});
