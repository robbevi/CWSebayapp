import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShipOrder } from '@warehouse/shared';

const config = vi.hoisted(() => ({
  env: { saleNotifyUrl: 'https://flow.example/trigger?sig=SECRET' as string | undefined },
}));
const shipping = vi.hoisted(() => ({ ordersToShip: vi.fn(async (): Promise<ShipOrder[]> => []) }));
vi.mock('../config/env.js', () => config);
vi.mock('./shipping.js', () => shipping);
vi.mock('./listingPrep.js', () => ({ PHOTO_BASE: 'https://spare.example' }));

const { notifyNewSales, ordersFor } = await import('./saleNotify.js');

const order = (id: string, lineItemIds: string[]): ShipOrder => ({
  orderId: id,
  createdAt: '2026-10-07T12:00:00.000Z',
  shipBy: '2026-10-14T04:59:59.000Z',
  buyer: 'buyer1',
  shipTo: { name: 'A Buyer', lines: ['1 Main St'], city: 'Madison', state: 'WI', postalCode: '53703', country: 'US', phone: '' },
  service: 'FedExSmartPost',
  items: lineItemIds.map((lineItemId) => ({
    lineItemId,
    ebayListingId: '111',
    sku: '383-0136',
    title: 'Seal',
    quantity: 5,
    part: null,
  })),
});

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  config.env.saleNotifyUrl = 'https://flow.example/trigger?sig=SECRET';
  fetchMock.mockResolvedValue(new Response('', { status: 202 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('announcing new sales', () => {
  it('finds the orders that hold the new line items', () => {
    const open = [order('A', ['A-1']), order('B', ['B-1', 'B-2'])];
    expect(ordersFor(open, ['B-2']).map((o) => o.orderId)).toEqual(['B']);
  });

  it('does nothing when no flow is set up', async () => {
    config.env.saleNotifyUrl = undefined;
    expect(await notifyNewSales(['A-1'])).toBe(0);
    expect(shipping.ordersToShip).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends one notice per order, with its subject and packing slip', async () => {
    shipping.ordersToShip.mockResolvedValueOnce([order('A', ['A-1', 'A-2']), order('B', ['B-1'])]);
    expect(await notifyNewSales(['A-1', 'A-2'])).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.orderId).toBe('A');
    expect(body.subject).toMatch(/^📦 eBay Order A · SKUs 383-0136 ×5, 383-0136 ×5 · Ship by /);
    expect(body.html).toContain('Buy shipping label in eBay');
    expect(body.sellerHubUrl).toContain('orderid=A');
  });

  it('leaves out a sale whose order is no longer waiting to ship', async () => {
    shipping.ordersToShip.mockResolvedValueOnce([order('B', ['B-1'])]);
    expect(await notifyNewSales(['A-1'])).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('carries on past a notice that fails, without logging the signed URL', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    shipping.ordersToShip.mockResolvedValueOnce([order('A', ['A-1']), order('B', ['B-1'])]);
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed https://flow.example/trigger?sig=SECRET'));
    expect(await notifyNewSales(['A-1', 'B-1'])).toBe(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET');
  });
});
