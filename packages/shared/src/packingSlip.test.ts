import { describe, expect, it } from 'vitest';
import { packingSlipBody, packingSlipPage, saleNotice, shipDue } from './packingSlip.js';
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
        photoFileId: null,
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

describe('the sale notice', () => {
  it('names the sale and the deadline in the subject', () => {
    expect(saleNotice(order).subject).toBe('SALE eBay Order: 12-34567-89012 - SKU: 383-0136 x 5 - Ship by Tues, Oct 13');
  });

  it('lists a few SKUs, then counts the rest', () => {
    const many = { ...order, items: ['A', 'B', 'C', 'D', 'E'].map((sku) => ({ ...order.items[0], sku, quantity: 1 })) };
    expect(saleNotice(many).subject).toBe(
      'SALE eBay Order: 12-34567-89012 - SKUs: A x 1, B x 1, C x 1 +2 more - Ship by Tues, Oct 13'
    );
  });

  it('counts the days left in Williston time', () => {
    expect(shipDue(order.shipBy, new Date('2026-10-07T18:00:00Z'))).toBe('6 days left');
    expect(shipDue(order.shipBy, new Date('2026-10-12T18:00:00Z'))).toBe('Due tomorrow');
    expect(shipDue(order.shipBy, new Date('2026-10-14T03:00:00Z'))).toBe('Due today');
    expect(shipDue(order.shipBy, new Date('2026-10-15T18:00:00Z'))).toBe('Overdue');
  });

  it("shows the part's photo from SPARE's upright thumbnail", () => {
    const withPhoto = { ...order, items: [{ ...order.items[0], part: { ...order.items[0].part!, photoFileId: 'abc' } }] };
    expect(saleNotice(withPhoto, { publicBase: 'https://spare.example' }).html).toContain(
      'src="https://spare.example/api/photos/abc/thumb"'
    );
    expect(saleNotice(withPhoto).html).not.toContain('<img');
  });

  it('heads the email with the logo when it has one, and the order number', () => {
    const html = saleNotice(order, { publicBase: 'https://spare.example' }).html;
    expect(html).toContain('src="https://spare.example/email/spare-logo.png"');
    expect(html).toContain('Order Number: 12-34567-89012');
  });

  it('rounds the ship-by box and buttons in Outlook too', () => {
    const html = saleNotice(order).html;
    expect(html.match(/<v:roundrect /g)).toHaveLength(3);
    expect(html).toContain('<!--[if !mso]><!-->');
  });

  it('puts the bin up front', () => {
    const html = saleNotice(order).html;
    expect(html).toMatch(/>Bin<\/div>\s*<div[^>]*>C-3-3</);
    expect(html).toMatch(/>Recovery bin<\/div>\s*<div[^>]*>A-1-3</);
  });

  it('links to the label and carries the slip', () => {
    const n = saleNotice(order);
    expect(n.html).toContain('https://www.ebay.com/sh/ord/details?orderid=12-34567-89012');
    expect(n.html).toContain('https://www.ebay.com/lbr/go?t=111-L1');
    expect(n.labelUrl).toBe('https://www.ebay.com/lbr/go?t=111-L1');
    expect(n.text).toContain('• 5 × 383-0136 — SEAL, OIL — bin C-3-3, recovery A-1-3');
    expect(n.skus).toEqual(['383-0136']);
  });
});
