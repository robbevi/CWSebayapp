import { describe, expect, it } from 'vitest';
import { PART_SALE_REMINDER_ROWS, partSaleReminder, saleNotice, shipDue, shipReminder } from './emails.js';
import type { Sale, ShipOrder } from './sales.js';

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
        photoUrl: '/api/photos/p/content',
      },
    },
  ],
};

const sale = (lineItemId: string, soldAt: string, over: Partial<Sale> = {}): Sale => ({
  lineItemId,
  orderId: `order-${lineItemId}`,
  soldAt,
  ebayListingId: '111',
  sku: '383-0136',
  qtySold: 1,
  grossSale: 1234.5,
  shipping: 0,
  tax: 0,
  fees: 0,
  netProceeds: 0,
  currency: 'USD',
  feesEstimated: false,
  syncedAt: soldAt,
  ...over,
});

const NOW = new Date('2026-10-07T18:00:00Z');

describe('days left to ship', () => {
  it('counts in Williston time', () => {
    expect(shipDue(order.shipBy, NOW)).toBe('6 days left');
    expect(shipDue(order.shipBy, new Date('2026-10-12T18:00:00Z'))).toBe('Due tomorrow');
    expect(shipDue(order.shipBy, new Date('2026-10-14T03:00:00Z'))).toBe('Due today');
    expect(shipDue(order.shipBy, new Date('2026-10-15T18:00:00Z'))).toBe('Overdue');
  });
});

describe('the sale email', () => {
  it('names the order, the SKUs and the deadline in the subject', () => {
    expect(saleNotice(order).subject).toBe(
      '[SALE] eBay Order: 12-34567-89012 - SKU: 383-0136 x 5 - Ship by Tues, Oct 13'
    );
  });

  it('lists a few SKUs, then counts the rest', () => {
    const many = { ...order, items: ['A', 'B', 'C', 'D', 'E'].map((sku) => ({ ...order.items[0], sku, quantity: 1 })) };
    expect(saleNotice(many).subject).toBe(
      '[SALE] eBay Order: 12-34567-89012 - SKUs: A x 1, B x 1, C x 1 +2 more - Ship by Tues, Oct 13'
    );
  });

  it('heads the email with the light logo on green, and the order number', () => {
    const html = saleNotice(order, { publicBase: 'https://spare.example' }).html;
    expect(html).toContain('src="https://spare.example/email/spare-logo-light.png"');
    expect(html).toContain('background:#0f7a5a');
    expect(html).toContain('Order Number: 12-34567-89012');
  });

  it('letters the header when it has nowhere to load the logo from', () => {
    expect(saleNotice(order).html).not.toContain('<img');
  });

  it('leaves out the photo and the shipping service', () => {
    const html = saleNotice(order, { publicBase: 'https://spare.example' }).html;
    expect(html).not.toContain('/api/photos/');
    expect(html).not.toMatch(/FedEx|SmartPost|Service/);
  });

  it('puts the recovery bin above the bin', () => {
    const html = saleNotice(order).html;
    expect(html).toMatch(/Recovery bin<\/td>\s*<td[^>]*>A-1-3</);
    expect(html).toMatch(/>Bin<\/td>\s*<td[^>]*>C-3-3</);
    expect(html.indexOf('A-1-3')).toBeLessThan(html.indexOf('C-3-3'));
  });

  it('shows only the bin when there is no recovery bin', () => {
    const plain = { ...order, items: [{ ...order.items[0], part: { ...order.items[0].part!, recoveryBin: '' } }] };
    expect(saleNotice(plain).html).not.toContain('Recovery bin');
  });

  it('escapes what the buyer typed', () => {
    expect(saleNotice(order).html).toContain('A &lt;Buyer&gt;');
    expect(saleNotice(order).html).not.toContain('<Buyer>');
  });

  it('links to the label and the order', () => {
    const n = saleNotice(order, { now: NOW });
    expect(n.kind).toBe('sale');
    expect(n.html).toContain('https://www.ebay.com/lbr/go?t=111-L1');
    expect(n.html).toContain('https://www.ebay.com/sh/ord/details?orderid=12-34567-89012');
    expect(n.html).toContain('6 days left');
    expect(n.text).toContain('• 5 × 383-0136 — SEAL, OIL — recovery bin A-1-3, bin C-3-3');
  });
});

describe('the shipping reminder', () => {
  const later = { ...order, orderId: 'later', shipBy: '2026-10-20T04:59:59.000Z' };
  const late = { ...order, orderId: 'late', shipBy: '2026-10-05T04:59:59.000Z' };

  it('lists the orders soonest due first, and says how many are late', () => {
    const n = shipReminder([later, late], { now: NOW });
    expect(n.kind).toBe('ship-reminder');
    expect(n.subject).toBe('[REMINDER] 2 eBay orders to ship - 1 overdue - soonest due Sun, Oct 4');
    expect(n.html.indexOf('Order Number: late')).toBeLessThan(n.html.indexOf('Order Number: later'));
    expect(n.html).toContain('Overdue');
  });

  it('names the order when there is only one', () => {
    expect(shipReminder([order], { now: NOW }).subject).toBe(
      '[REMINDER] 1 eBay order to ship - Order: 12-34567-89012 - Ship by Tues, Oct 13'
    );
  });

  it('gives each order its bins and its label button', () => {
    const html = shipReminder([order], { now: NOW }).html;
    expect(html).toContain('A-1-3');
    expect(html).toContain('https://www.ebay.com/lbr/go?t=111-L1');
  });
});

describe('the Part Sale reminder', () => {
  it('lists the sales oldest first, with a way into SPARE', () => {
    const n = partSaleReminder(
      [sale('b', '2026-10-05T15:00:00Z'), sale('a', '2026-09-30T15:00:00Z', { sku: 'OLD-1', qtySold: 2 })],
      { publicBase: 'https://spare.example' }
    );
    expect(n.kind).toBe('part-sale-reminder');
    expect(n.subject).toBe('[REMINDER] Cetaris Part Sale needed for 2 eBay sales');
    expect(n.html.indexOf('OLD-1')).toBeLessThan(n.html.indexOf('order-b'));
    expect(n.html).toContain('$1,234.50');
    expect(n.html).toContain('href="https://spare.example"');
  });

  it('names a sale with no SKU by its eBay item number', () => {
    expect(partSaleReminder([sale('n', '2026-10-01T12:00:00Z', { sku: '' })]).html).toContain('Item 111');
  });

  it('shows the first rows and counts the rest', () => {
    const many = Array.from({ length: PART_SALE_REMINDER_ROWS + 5 }, (_, k) =>
      sale(`s${k}`, new Date(Date.UTC(2026, 8, 1 + k)).toISOString())
    );
    const n = partSaleReminder(many);
    expect(n.html).toContain('…and 5 more in SPARE.');
    expect(n.text).toContain('…and 5 more in SPARE.');
  });
});
