import { saleNotice, type ShipOrder } from '@warehouse/shared';
import { env } from '../config/env.js';
import { PHOTO_BASE } from './listingPrep.js';
import { ordersToShip } from './shipping.js';

/**
 * Announcing new sales through the Power Automate flow "SPARE Sale Notification".
 *
 * Each order with a newly synced sale goes to the flow's HTTP trigger once, carrying its
 * subject line and an email body that holds the pick list; the flow sends it on, so
 * who receives it is decided there rather than in SPARE.
 *
 * Only orders eBay still has waiting to ship are announced. That keeps a sale that was
 * packed before SPARE synced from setting anyone off, and it means a Sales sheet rebuilt
 * from scratch can't email a year of old orders.
 *
 * The trigger's URL carries the flow's access signature, so it lives only in the
 * environment (SPARE_SALE_NOTIFY_URL), never in code or logs.
 */

export function isSaleNotifyConfigured(): boolean {
  return !!env.saleNotifyUrl;
}

/** The open orders that hold any of these line items. */
export function ordersFor(orders: ShipOrder[], lineItemIds: string[]): ShipOrder[] {
  const wanted = new Set(lineItemIds);
  return orders.filter((o) => o.items.some((i) => wanted.has(i.lineItemId)));
}

async function post(order: ShipOrder): Promise<void> {
  let res: Response;
  try {
    res = await fetch(env.saleNotifyUrl!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saleNotice(order, { photoBase: PHOTO_BASE })),
    });
  } catch {
    // fetch's own errors quote the URL, signature and all.
    throw new Error("Couldn't reach the sale notification flow.");
  }
  if (!res.ok) {
    const reason = (await res.text()).replace(/https?:\/\/\S+/g, '[url]').slice(0, 200);
    throw new Error(`Sale notification failed (${res.status}): ${reason}`);
  }
}

/**
 * Sends one notice per order holding a new sale, and returns how many went. A notice that
 * fails is logged and skipped: the sale is already saved, and the orders-to-ship list in
 * SPARE still shows it.
 */
export async function notifyNewSales(lineItemIds: string[]): Promise<number> {
  if (!isSaleNotifyConfigured() || lineItemIds.length === 0) return 0;
  const orders = ordersFor(await ordersToShip(), lineItemIds);
  let sent = 0;
  for (const order of orders) {
    try {
      await post(order);
      sent++;
    } catch (err) {
      console.warn(`[notify] Order ${order.orderId}:`, err instanceof Error ? err.message : err);
    }
  }
  return sent;
}
