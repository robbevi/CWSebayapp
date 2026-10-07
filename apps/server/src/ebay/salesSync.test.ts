import { beforeEach, describe, expect, it, vi } from 'vitest';

const sheets = vi.hoisted(() => ({
  getAllParts: vi.fn(async () => []),
  replaceListings: vi.fn(async () => 0),
  updatePart: vi.fn(),
  upsertSales: vi.fn(async () => ({ added: 0, updated: 0, unchanged: 0 })),
}));
const orders = vi.hoisted(() => ({ fetchSales: vi.fn(async () => []) }));
const listings = vi.hoisted(() => ({ fetchListings: vi.fn(async () => []) }));

vi.mock('../google/sheetsService.js', () => sheets);
vi.mock('./ordersService.js', () => orders);
vi.mock('./listingsService.js', () => listings);

const { isStale, lastSync, resetSyncState, STALE_AFTER_MS, syncSales } = await import('./salesSync.js');

beforeEach(() => {
  vi.clearAllMocks();
  resetSyncState();
});

describe('syncing with eBay', () => {
  it('counts as stale before it has ever run', () => {
    expect(isStale()).toBe(true);
    expect(lastSync()).toBeNull();
  });

  it('is fresh straight after a sync, and stale again after half an hour', async () => {
    await syncSales();
    expect(isStale()).toBe(false);
    expect(isStale(Date.now() + STALE_AFTER_MS + 1000)).toBe(true);
  });

  it('runs one sync at a time, however many ask at once', async () => {
    let release!: () => void;
    orders.fetchSales.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve([]))));

    const first = syncSales();
    const second = syncSales();
    release();
    await Promise.all([first, second]);
    expect(orders.fetchSales).toHaveBeenCalledTimes(1);
  });

  it('keeps the sales it wrote when the listings half fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    listings.fetchListings.mockRejectedValueOnce(new Error('eBay listings down'));
    const result = await syncSales();
    expect(sheets.upsertSales).toHaveBeenCalled();
    expect(result.listingsError).toMatch(/listings down/);
  });

  it('keeps the window inside what eBay accepts', async () => {
    await syncSales(10_000);
    const [since] = orders.fetchSales.mock.calls[0] as unknown as [Date];
    expect(Date.now() - since.getTime()).toBeLessThanOrEqual(365 * 86_400_000 + 1000);
  });
});
