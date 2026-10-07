import { describe, expect, it } from 'vitest';
import { packingSlipBody, packingSlipPage } from './packingSlip.js';
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
    expect(html).toContain('FedEx SmartPost');
    // Ship-by is read in Williston's time, not the server's.
    expect(html).toContain('ship by Tues, Oct 13');
  });

  it('escapes what the buyer typed', () => {
    expect(packingSlipBody(order)).toContain('A &lt;Buyer&gt;');
    expect(packingSlipBody(order)).not.toContain('<Buyer>');
  });

  it('prints itself when opened on its own', () => {
    expect(packingSlipPage(order)).toContain('window.print()');
  });
});
