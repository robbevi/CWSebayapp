import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CetarisLog, Notice, Sale, ShipOrder } from '@warehouse/shared';

const log = vi.hoisted(() => {
  const sent = new Set<string>();
  return {
    sent,
    wasSent: vi.fn(async (key: string) => sent.has(key)),
    markSent: vi.fn(async (key: string) => void sent.add(key)),
  };
});
const notify = vi.hoisted(() => ({
  configured: true,
  isSaleNotifyConfigured: vi.fn(() => notify.configured),
  postNotice: vi.fn(async (_n: Notice) => undefined),
  NOTICE_OPTIONS: { publicBase: 'https://spare.example' },
}));
const shipping = vi.hoisted(() => ({ ordersToShip: vi.fn(async (): Promise<ShipOrder[]> => []) }));
const sheets = vi.hoisted(() => ({ getSales: vi.fn(async (): Promise<Sale[]> => []) }));
const cetaris = vi.hoisted(() => ({ getCetarisLogs: vi.fn(async () => new Map<string, CetarisLog>()) }));

vi.mock('../google/notifyLog.js', () => log);
vi.mock('./saleNotify.js', () => notify);
vi.mock('./shipping.js', () => shipping);
vi.mock('../google/sheetsService.js', () => sheets);
vi.mock('../google/cetarisStore.js', () => cetaris);

const { sendDailyReminders } = await import('./reminders.js');

// Thursday, Oct 8 2026 — 8 AM in Williston (Central Daylight Time).
const THURSDAY_8AM = new Date('2026-10-08T13:00:00Z');

const order = (orderId: string, createdAt: string): ShipOrder => ({
  orderId,
  createdAt,
  shipBy: '2026-10-13T04:59:59.000Z',
  buyer: 'b',
  shipTo: { name: 'A', lines: [], city: 'Madison', state: 'WI', postalCode: '53703', country: 'US', phone: '' },
  service: '',
  items: [{ lineItemId: `${orderId}-L`, ebayListingId: '1', sku: 'S', title: 'T', quantity: 1, part: null }],
});

const sale = (lineItemId: string, soldAt: string): Sale => ({
  lineItemId,
  orderId: `o-${lineItemId}`,
  soldAt,
  ebayListingId: '1',
  sku: 'S',
  qtySold: 1,
  grossSale: 10,
  shipping: 0,
  tax: 0,
  fees: 0,
  netProceeds: 10,
  currency: 'USD',
  feesEstimated: false,
  syncedAt: soldAt,
});

beforeEach(() => {
  vi.clearAllMocks();
  log.sent.clear();
  notify.configured = true;
  shipping.ordersToShip.mockResolvedValue([]);
  sheets.getSales.mockResolvedValue([]);
  cetaris.getCetarisLogs.mockResolvedValue(new Map());
});

describe('the daily reminders', () => {
  it('waits for 7 AM Williston time', async () => {
    shipping.ordersToShip.mockResolvedValue([order('A', '2026-10-06T12:00:00Z')]);
    expect(await sendDailyReminders(new Date('2026-10-08T11:30:00Z'))).toEqual({ ship: 0, partSale: 0 });
    expect(notify.postNotice).not.toHaveBeenCalled();
  });

  it('stays quiet at weekends', async () => {
    shipping.ordersToShip.mockResolvedValue([order('A', '2026-10-06T12:00:00Z')]);
    await sendDailyReminders(new Date('2026-10-10T15:00:00Z'));
    expect(notify.postNotice).not.toHaveBeenCalled();
  });

  it('does nothing when no flow is set up', async () => {
    notify.configured = false;
    await sendDailyReminders(THURSDAY_8AM);
    expect(shipping.ordersToShip).not.toHaveBeenCalled();
  });

  it("reminds about orders still to ship, leaving out today's", async () => {
    shipping.ordersToShip.mockResolvedValue([order('OLD', '2026-10-06T12:00:00Z'), order('NEW', '2026-10-08T12:30:00Z')]);
    const result = await sendDailyReminders(THURSDAY_8AM);
    expect(result.ship).toBe(1);
    const notice = notify.postNotice.mock.calls[0][0];
    expect(notice.kind).toBe('ship-reminder');
    expect(notice.html).toContain('Order Number: OLD');
    expect(notice.html).not.toContain('Order Number: NEW');
    expect(log.sent.has('ship-reminder:2026-10-08')).toBe(true);
  });

  it('reminds about sales with no Part Sale logged', async () => {
    sheets.getSales.mockResolvedValue([sale('done', '2026-10-01T12:00:00Z'), sale('waiting', '2026-10-02T12:00:00Z')]);
    cetaris.getCetarisLogs.mockResolvedValue(
      new Map([['done', { lineItemId: 'done', cetarisSaleNumber: '1234567', loggedAt: '', loggedBy: '' }]])
    );
    const result = await sendDailyReminders(THURSDAY_8AM);
    expect(result.partSale).toBe(1);
    const notice = notify.postNotice.mock.calls.find(([n]) => n.kind === 'part-sale-reminder')![0];
    expect(notice.subject).toBe('[REMINDER] Cetaris Part Sale needed for 1 eBay sale');
    expect(notice.html).toContain('o-waiting');
  });

  it('sends each once a day, however many syncs there are', async () => {
    shipping.ordersToShip.mockResolvedValue([order('A', '2026-10-06T12:00:00Z')]);
    sheets.getSales.mockResolvedValue([sale('x', '2026-10-02T12:00:00Z')]);
    await sendDailyReminders(THURSDAY_8AM);
    await sendDailyReminders(new Date('2026-10-08T18:00:00Z'));
    expect(notify.postNotice).toHaveBeenCalledTimes(2);
  });

  it('sends nothing when nothing is waiting, and checks no more that day', async () => {
    await sendDailyReminders(THURSDAY_8AM);
    await sendDailyReminders(new Date('2026-10-08T18:00:00Z'));
    expect(notify.postNotice).not.toHaveBeenCalled();
    expect(shipping.ordersToShip).toHaveBeenCalledTimes(1);
  });

  it('tries again on the next sync when sending fails', async () => {
    shipping.ordersToShip.mockResolvedValue([order('A', '2026-10-06T12:00:00Z')]);
    notify.postNotice.mockRejectedValueOnce(new Error('flow down'));
    await expect(sendDailyReminders(THURSDAY_8AM)).rejects.toThrow('flow down');
    expect(log.sent.has('ship-reminder:2026-10-08')).toBe(false);
    await sendDailyReminders(THURSDAY_8AM);
    expect(log.sent.has('ship-reminder:2026-10-08')).toBe(true);
  });
});
