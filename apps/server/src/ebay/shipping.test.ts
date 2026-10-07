import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryPart, Photo } from '@warehouse/shared';

const ebay = vi.hoisted(() => ({ ebayGet: vi.fn() }));
const sheets = vi.hoisted(() => ({ getAllParts: vi.fn() }));
vi.mock('./client.js', () => ebay);
vi.mock('../google/sheetsService.js', () => sheets);

const { ordersToShip } = await import('./shipping.js');

function part(sku: string, over: Partial<InventoryPart> = {}): InventoryPart {
  return {
    id: `id-${sku}`,
    sku,
    description: `PART ${sku}`,
    manufacturer: '',
    inventorySite: 'NDPARTS',
    binLocation: 'C-3-3',
    newBinLocation: 'A-1-3',
    qoh: 5,
    itemCondition: 'New',
    photographed: true,
    photos: [{ fileId: 'p', url: '/api/photos/p/content', fileName: 'p.jpg', uploadedAt: '' }] as Photo[],
    itemListed: true,
    transferredToMarketRecovery: false,
    ...over,
  } as unknown as InventoryPart;
}

const order = (id: string, over: Record<string, unknown> = {}) => ({
  orderId: id,
  creationDate: '2026-10-07T12:00:00.000Z',
  orderFulfillmentStatus: 'NOT_STARTED',
  cancelStatus: { cancelState: 'NONE_REQUESTED' },
  buyer: { username: 'buyer1' },
  fulfillmentStartInstructions: [
    {
      shippingStep: {
        shippingServiceCode: 'FedExSmartPost',
        shipTo: {
          fullName: 'A Buyer',
          contactAddress: { addressLine1: '1 Main St', city: 'Madison', stateOrProvince: 'WI', postalCode: '53703', countryCode: 'US' },
        },
      },
    },
  ],
  lineItems: [
    {
      lineItemId: `${id}-L`,
      legacyItemId: '111',
      sku: '383-0136',
      title: 'Seal',
      quantity: 5,
      lineItemFulfillmentInstructions: { shipByDate: '2026-10-14T04:59:59.000Z' },
    },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  sheets.getAllParts.mockResolvedValue([part('383-0136'), part('OLD', { ebayListingId: '999' })]);
});

describe('ordersToShip', () => {
  it('says what to pick, from where, and where it goes', async () => {
    ebay.ebayGet.mockResolvedValue({ orders: [order('O-1')] });
    const [o] = await ordersToShip();
    expect(o).toMatchObject({
      orderId: 'O-1',
      service: 'FedExSmartPost',
      shipTo: { name: 'A Buyer', city: 'Madison', state: 'WI', postalCode: '53703' },
    });
    expect(o.items[0]).toMatchObject({
      quantity: 5,
      sku: '383-0136',
      part: { binLocation: 'C-3-3', recoveryBin: 'A-1-3', condition: 'New', photoUrl: '/api/photos/p/content' },
    });
  });

  it('asks eBay only for orders not yet shipped', async () => {
    ebay.ebayGet.mockResolvedValue({ orders: [] });
    await ordersToShip();
    expect(decodeURIComponent(String(ebay.ebayGet.mock.calls[0][0]))).toContain(
      'orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}'
    );
  });

  it('leaves out an order the buyer cancelled', async () => {
    ebay.ebayGet.mockResolvedValue({
      orders: [order('O-1'), order('O-2', { cancelStatus: { cancelState: 'CANCELED' } })],
    });
    expect((await ordersToShip()).map((o) => o.orderId)).toEqual(['O-1']);
  });

  it('matches an item with no SKU by its listing number', async () => {
    ebay.ebayGet.mockResolvedValue({
      orders: [order('O-1', { lineItems: [{ lineItemId: 'L', legacyItemId: '999', sku: '', title: 'Old part', quantity: 1 }] })],
    });
    const [o] = await ordersToShip();
    expect(o.items[0]).toMatchObject({ sku: 'OLD', part: { description: 'PART OLD' } });
  });

  it('puts the soonest due first', async () => {
    const later = order('LATER');
    const sooner = order('SOONER', {
      lineItems: [{ ...order('x').lineItems[0], lineItemFulfillmentInstructions: { shipByDate: '2026-10-09T04:59:59.000Z' } }],
    });
    ebay.ebayGet.mockResolvedValue({ orders: [later, sooner] });
    expect((await ordersToShip()).map((o) => o.orderId)).toEqual(['SOONER', 'LATER']);
  });
});
