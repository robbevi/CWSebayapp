import { beforeEach, describe, expect, it, vi } from 'vitest';

const ebay = vi.hoisted(() => ({
  ebayGet: vi.fn(),
  ebayFinancesBaseUrl: () => 'https://apiz.ebay.com',
}));
vi.mock('./client.js', () => ebay);
vi.mock('../config/env.js', () => ({ env: { ebayEnv: 'production', ebayMarketplaceId: 'EBAY_US' } }));

const { fetchSales } = await import('./ordersService.js');

const order = {
  orders: [
    {
      orderId: 'O-1',
      creationDate: '2026-10-01T12:00:00.000Z',
      lineItems: [
        { lineItemId: 'L-1', legacyItemId: 'I-1', sku: 'A', quantity: 1, lineItemCost: { value: '100.00' } },
        { lineItemId: 'L-2', legacyItemId: 'I-2', sku: 'B', quantity: 2, lineItemCost: { value: '50.00' } },
      ],
    },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('fetchSales', () => {
  it('asks the finances host, not the usual one', async () => {
    ebay.ebayGet.mockImplementation(async (path: string) => (path.includes('/order') ? order : { transactions: [] }));
    await fetchSales(new Date('2026-09-01T00:00:00Z'), new Date('2026-10-02T00:00:00Z'));
    const finance = ebay.ebayGet.mock.calls.find(([path]) => String(path).includes('/sell/finances/'));
    expect(finance?.[1]).toBe('https://apiz.ebay.com');
  });

  it('takes real fees and the payout from the finance record', async () => {
    ebay.ebayGet.mockImplementation(async (path: string) =>
      path.includes('/order')
        ? order
        : {
            transactions: [
              {
                orderId: 'O-1',
                payoutId: '7000123456',
                transactionStatus: 'PAYOUT',
                orderLineItems: [
                  { lineItemId: 'L-1', marketplaceFees: [{ amount: { value: '12.50' } }] },
                  { lineItemId: 'L-2', marketplaceFees: [{ amount: { value: '7.25' } }] },
                ],
              },
            ],
          }
    );
    const sales = await fetchSales(new Date('2026-09-01T00:00:00Z'), new Date('2026-10-02T00:00:00Z'));
    expect(sales.find((s) => s.lineItemId === 'L-1')).toMatchObject({
      fees: 12.5,
      feesEstimated: false,
      payoutId: '7000123456',
      payoutStatus: 'PAYOUT',
    });
    expect(sales.find((s) => s.lineItemId === 'L-2')).toMatchObject({ fees: 7.25, payoutId: '7000123456' });
  });

  it('leaves the payout empty while eBay is still holding the money', async () => {
    ebay.ebayGet.mockImplementation(async (path: string) =>
      path.includes('/order')
        ? order
        : {
            transactions: [
              {
                orderId: 'O-1',
                transactionStatus: 'FUNDS_ON_HOLD',
                orderLineItems: [{ lineItemId: 'L-1', marketplaceFees: [{ amount: { value: '12.50' } }] }],
              },
            ],
          }
    );
    const [sale] = await fetchSales(new Date('2026-09-01T00:00:00Z'), new Date('2026-10-02T00:00:00Z'));
    expect(sale).toMatchObject({ payoutStatus: 'FUNDS_ON_HOLD', feesEstimated: false });
    expect(sale.payoutId).toBeUndefined();
  });

  it('estimates fees, and still succeeds, when the finance records cannot be read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    ebay.ebayGet.mockImplementation(async (path: string) => {
      if (path.includes('/order')) return order;
      throw new Error('eBay GET failed (404)');
    });
    const sales = await fetchSales(new Date('2026-09-01T00:00:00Z'), new Date('2026-10-02T00:00:00Z'));
    expect(sales).toHaveLength(2);
    expect(sales.every((s) => s.feesEstimated && !s.payoutId)).toBe(true);
  });
});
