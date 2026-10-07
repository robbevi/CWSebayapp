import { chicagoDateString, partSaleReminder, shipReminder } from '@warehouse/shared';
import { getCetarisLogs } from '../google/cetarisStore.js';
import { markSent, wasSent } from '../google/notifyLog.js';
import { getSales } from '../google/sheetsService.js';
import { isSaleNotifyConfigured, NOTICE_OPTIONS, postNotice } from './saleNotify.js';
import { ordersToShip } from './shipping.js';

/**
 * The weekday-morning reminders: orders still waiting on a label, and sales still waiting
 * on their Cetaris Part Sale. Each goes out once a day, on the first sync from 7 AM
 * Williston time, and only when there is something in it.
 *
 * A sale is left out of both on the day it sold — its own email has just gone out, and
 * the Part Sale can wait for the morning.
 */

export const REMINDER_HOUR = 7;

function williston(now: Date): { day: string; hour: number; weekend: boolean } {
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'America/Chicago' }).format(now);
  const weekday = part({ weekday: 'short' });
  return {
    day: chicagoDateString(now.toISOString()),
    hour: Number(part({ hour: 'numeric', hourCycle: 'h23' })),
    weekend: weekday === 'Sat' || weekday === 'Sun',
  };
}

export interface ReminderResult {
  ship: number;
  partSale: number;
}

/**
 * Sends whichever of today's reminders are due and haven't gone. Each is recorded only
 * once it has been sent (or found to have nothing in it), so one that fails is tried
 * again on the next sync.
 */
export async function sendDailyReminders(now = new Date()): Promise<ReminderResult> {
  const result: ReminderResult = { ship: 0, partSale: 0 };
  if (!isSaleNotifyConfigured()) return result;
  const { day, hour, weekend } = williston(now);
  if (weekend || hour < REMINDER_HOUR) return result;
  const soldBeforeToday = (iso: string) => !!iso && chicagoDateString(iso) < day;

  const shipKey = `ship-reminder:${day}`;
  if (!(await wasSent(shipKey))) {
    const waiting = (await ordersToShip()).filter((o) => soldBeforeToday(o.createdAt));
    if (waiting.length) await postNotice(shipReminder(waiting, { ...NOTICE_OPTIONS, now }));
    await markSent(shipKey, `${waiting.length} orders`);
    result.ship = waiting.length;
  }

  const partSaleKey = `part-sale-reminder:${day}`;
  if (!(await wasSent(partSaleKey))) {
    const [sales, logs] = await Promise.all([getSales(), getCetarisLogs()]);
    const waiting = sales.filter((s) => !logs.has(s.lineItemId) && soldBeforeToday(s.soldAt));
    if (waiting.length) await postNotice(partSaleReminder(waiting, { ...NOTICE_OPTIONS, now }));
    await markSent(partSaleKey, `${waiting.length} sales`);
    result.partSale = waiting.length;
  }

  return result;
}
