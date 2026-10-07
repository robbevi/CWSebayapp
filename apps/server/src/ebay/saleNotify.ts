import { saleNotice, type Notice, type ShipOrder } from '@warehouse/shared';
import { env } from '../config/env.js';
import { PHOTO_BASE } from './listingPrep.js';
import { ordersToShip } from './shipping.js';

/**
 * Emails through the Power Automate flow "SPARE Sale Notification": one for each new
 * sale, and the daily reminders (see reminders.ts).
 *
 * SPARE posts each email's subject and finished HTML body to the flow's HTTP trigger and
 * the flow sends it on, so who receives it is decided there rather than in SPARE. Each
 * post names its kind, so the flow can send one kind somewhere else.
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

/** Where the emails load the logo from, and link back into SPARE. */
export const NOTICE_OPTIONS = { publicBase: PHOTO_BASE };

/** The open orders that hold any of these line items. */
export function ordersFor(orders: ShipOrder[], lineItemIds: string[]): ShipOrder[] {
  const wanted = new Set(lineItemIds);
  return orders.filter((o) => o.items.some((i) => wanted.has(i.lineItemId)));
}

/** Hands one email to the flow. */
export async function postNotice(notice: Notice): Promise<void> {
  if (!env.saleNotifyUrl) throw new Error('Sale notifications are not configured. Set SPARE_SALE_NOTIFY_URL.');
  let res: Response;
  try {
    res = await fetch(env.saleNotifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notice),
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
 * Sends one email per order holding a new sale, and returns how many went. One that fails
 * is logged and skipped: the sale is already saved, and the orders-to-ship list in SPARE
 * still shows it.
 */
export async function notifyNewSales(lineItemIds: string[]): Promise<number> {
  if (!isSaleNotifyConfigured() || lineItemIds.length === 0) return 0;
  const orders = ordersFor(await ordersToShip(), lineItemIds);
  let sent = 0;
  for (const order of orders) {
    try {
      await postNotice(saleNotice(order, NOTICE_OPTIONS));
      sent++;
    } catch (err) {
      console.warn(`[notify] Order ${order.orderId}:`, err instanceof Error ? err.message : err);
    }
  }
  return sent;
}
