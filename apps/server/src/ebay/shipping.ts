import { groupPartsBySku, type PartGroup, type ShipItem, type ShipOrder } from '@warehouse/shared';
import { getAllParts } from '../google/sheetsService.js';
import { ebayGet } from './client.js';

/**
 * Orders that still have to go out, read live from eBay.
 *
 * Live rather than kept: eBay knows the moment a label is bought and the order marked
 * shipped, so the list empties itself as the work is done, with nobody ticking anything
 * off in SPARE.
 */

interface Address {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateOrProvince?: string;
  postalCode?: string;
  countryCode?: string;
}

interface Order {
  orderId?: string;
  creationDate?: string;
  orderFulfillmentStatus?: string;
  cancelStatus?: { cancelState?: string };
  buyer?: { username?: string };
  fulfillmentStartInstructions?: {
    shippingStep?: {
      shippingServiceCode?: string;
      shipTo?: { fullName?: string; contactAddress?: Address; primaryPhone?: { phoneNumber?: string } };
    };
  }[];
  lineItems?: {
    lineItemId?: string;
    legacyItemId?: string;
    sku?: string;
    title?: string;
    quantity?: number;
    lineItemFulfillmentInstructions?: { shipByDate?: string };
  }[];
}

const PAGE_SIZE = 50;

async function openOrders(): Promise<Order[]> {
  const orders: Order[] = [];
  let offset = 0;
  for (;;) {
    const filter = encodeURIComponent('orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}');
    const page = await ebayGet<{ orders?: Order[] }>(
      `/sell/fulfillment/v1/order?filter=${filter}&limit=${PAGE_SIZE}&offset=${offset}`
    );
    const batch = page.orders ?? [];
    orders.push(...batch);
    if (batch.length < PAGE_SIZE || offset >= 1_000) break;
    offset += PAGE_SIZE;
  }
  // A cancelled order is not one to ship, whatever its fulfillment state says.
  return orders.filter((o) => !o.cancelStatus?.cancelState || o.cancelStatus.cancelState === 'NONE_REQUESTED');
}

/** The part an item is for: by SKU where eBay has one, and otherwise by listing number. */
function partFor(groups: PartGroup[], sku: string, listingId: string): PartGroup | undefined {
  const bySku = sku ? groups.find((g) => g.sku.trim().toUpperCase() === sku.trim().toUpperCase()) : undefined;
  return bySku ?? groups.find((g) => g.records.some((r) => r.ebayListingId === listingId));
}

export async function ordersToShip(): Promise<ShipOrder[]> {
  const [orders, groups] = await Promise.all([openOrders(), getAllParts().then(groupPartsBySku)]);

  return orders
    .map((o): ShipOrder => {
      const step = o.fulfillmentStartInstructions?.[0]?.shippingStep;
      const address = step?.shipTo?.contactAddress ?? {};
      const items: ShipItem[] = (o.lineItems ?? []).map((li) => {
        const group = partFor(groups, li.sku ?? '', li.legacyItemId ?? '');
        return {
          lineItemId: li.lineItemId ?? '',
          ebayListingId: li.legacyItemId ?? '',
          sku: li.sku || group?.sku || '',
          title: li.title ?? '',
          quantity: li.quantity ?? 1,
          part: group
            ? {
                id: group.primary.id,
                description: group.description,
                binLocation: group.locations.map((l) => l.binLocation).filter(Boolean).join(', '),
                recoveryBin: group.newBinLocation ?? '',
                site: group.inventorySite,
                condition: group.itemCondition ?? '',
                photoUrl: group.photos[0]?.url ?? null,
                photoFileId: group.photos[0]?.fileId ?? null,
              }
            : null,
        };
      });
      const shipBys = (o.lineItems ?? [])
        .map((li) => li.lineItemFulfillmentInstructions?.shipByDate)
        .filter((d): d is string => !!d)
        .sort();
      return {
        orderId: o.orderId ?? '',
        createdAt: o.creationDate ?? '',
        shipBy: shipBys[0] ?? null,
        buyer: o.buyer?.username ?? '',
        shipTo: {
          name: step?.shipTo?.fullName ?? '',
          lines: [address.addressLine1, address.addressLine2].filter((l): l is string => !!l),
          city: address.city ?? '',
          state: address.stateOrProvince ?? '',
          postalCode: address.postalCode ?? '',
          country: address.countryCode ?? '',
          phone: step?.shipTo?.primaryPhone?.phoneNumber ?? '',
        },
        service: step?.shippingServiceCode ?? '',
        items,
      };
    })
    // Soonest due first: that is the order they should be packed in.
    .sort((a, b) => (a.shipBy ?? a.createdAt).localeCompare(b.shipBy ?? b.createdAt));
}
