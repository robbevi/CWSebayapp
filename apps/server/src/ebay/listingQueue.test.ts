import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryPart, Photo } from '@warehouse/shared';

const sheets = vi.hoisted(() => ({ getAllParts: vi.fn(), updatePart: vi.fn() }));
const research = vi.hoisted(() => ({ latestResearch: vi.fn() }));
const batch = vi.hoisted(() => ({ researchedSkus: vi.fn() }));

vi.mock('../google/sheetsService.js', () => sheets);
vi.mock('./researchService.js', () => research);
vi.mock('./researchBatch.js', () => batch);
const publish = vi.hoisted(() => ({
  publishListing: vi.fn(),
  verifyListing: vi.fn(),
  getSellerSetup: vi.fn(),
  resolveCategory: vi.fn(),
  suggestCategories: vi.fn(),
}));
vi.mock('./publishService.js', () => publish);

const { buildPlan, firstDay, policiesFor, queuePolicies } = await import('./listingQueue.js');

/** The account's policies as SPARE reads them, copies and all. */
const SETUP = {
  shipping: [
    { id: 'ship-free', name: 'Free Shipping' },
    { id: 'ship-free-copy', name: 'Free Shipping Copy' },
    { id: 'ship-fedex', name: 'FedEx Preferrred' },
  ],
  returns: [
    { id: 'ret-none', name: 'No Returns' },
    { id: 'ret-motors', name: 'eBay Motors Returns Accepted' },
  ],
  payment: [
    { id: 'pay', name: 'eBay Managed Payments (Default)' },
    { id: 'pay-copy', name: 'eBay Managed Payments (Default) Copy' },
  ],
  defaults: { shipping: 'ship-fedex', returns: 'ret-motors', payment: 'pay' },
  shipFrom: { location: 'Williston, ND', postalCode: '58801', country: 'US' },
};

const NOW = new Date('2026-09-23T15:00:00.000Z');

/** A part ready to list: photographed, counted, graded, priced, not yet on eBay. */
function part(sku: string, over: Partial<InventoryPart> = {}): InventoryPart {
  return {
    id: `id-${sku}`,
    sku,
    description: `PART ${sku}`,
    manufacturer: 'Parker',
    inventorySite: 'NDPARTS',
    binLocation: 'C-4-5',
    qoh: 2,
    confirmedQoh: 2,
    itemCondition: 'New',
    boxCondition: 'Good',
    photographed: true,
    photos: [{ id: 'p1', url: '/api/photos/p1/content', name: 'p1.jpg' }] as Photo[],
    activeRecoveryPriceBasis: 100,
    itemListed: false,
    transferredToMarketRecovery: false,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  } as unknown as InventoryPart;
}

const researched = (title: string) => ({
  found: true,
  createdAt: '2026-09-22T00:00:00.000Z',
  listing: { title, price: 120, categoryId: '170141', titleOptions: [], priceOptions: [], specifics: [] },
  notes: [],
});

/** The research folder as SPARE reads it: every SKU handed in, unless a test says otherwise. */
function folderHolds(...skus: string[]) {
  batch.researchedSkus.mockResolvedValue(new Set(skus.map((s) => s.toLowerCase())));
}

beforeEach(() => {
  vi.clearAllMocks();
  research.latestResearch.mockResolvedValue(researched('A TITLE'));
  publish.getSellerSetup.mockResolvedValue(SETUP);
  publish.resolveCategory.mockResolvedValue({ id: '170141', name: 'Truck Parts', siteId: '0', leaf: true, required: [], recommended: [] });
  batch.researchedSkus.mockImplementation(async () => {
    const parts = (await sheets.getAllParts()) as { sku: string }[];
    return new Set(parts.map((p) => p.sku.toLowerCase()));
  });
});

describe('firstDay', () => {
  // 3pm on the 23rd, local to whoever is running this.
  const afternoon = new Date(2026, 8, 23, 15, 0, 0);

  it('goes out today when the hour is still ahead', () => {
    const day = firstDay(18, afternoon);
    expect(day.getDate()).toBe(23);
    expect(day.getHours()).toBe(18);
  });

  it('waits for tomorrow when today no longer leaves eBay its notice', () => {
    // 3:30pm is under the hour eBay wants, so a 4pm batch belongs to tomorrow.
    expect(firstDay(16, new Date(2026, 8, 23, 15, 30)).getDate()).toBe(24);
    expect(firstDay(9, afternoon).getDate()).toBe(24);
  });

  it('honors a day that was asked for', () => {
    const day = firstDay(9, afternoon, '2026-09-28');
    expect(day.getDate()).toBe(28);
    expect(day.getHours()).toBe(9);
  });

  it('moves a day that has already gone by to one that works', () => {
    expect(firstDay(9, afternoon, '2026-09-20').getDate()).toBe(24);
  });

  it('falls back when the date makes no sense', () => {
    expect(firstDay(9, afternoon, 'not-a-day').getDate()).toBe(24);
  });
});

describe('queuePolicies', () => {
  it('ignores the copies nobody meant to list under', async () => {
    publish.getSellerSetup.mockResolvedValue(SETUP);
    const p = await queuePolicies();
    expect(p.freeShipping?.id).toBe('ship-free');
    expect(p.paidShipping?.id).toBe('ship-fedex');
    expect(p.payment?.id).toBe('pay');
    expect(p.motorsReturns?.id).toBe('ret-motors');
    expect(p.noReturns?.id).toBe('ret-none');
  });
});

describe('policiesFor', () => {
  const all = {
    freeShipping: { id: 'ship-free', name: 'Free Shipping' },
    paidShipping: { id: 'ship-fedex', name: 'FedEx Preferrred' },
    motorsReturns: { id: 'ret-motors', name: 'eBay Motors Returns Accepted' },
    noReturns: { id: 'ret-none', name: 'No Returns' },
    payment: { id: 'pay', name: 'eBay Managed Payments (Default)' },
  };

  it('pairs Motors with returns and everything else with none', () => {
    expect(policiesFor(all, true, 'paid')).toMatchObject({ returns: 'ret-motors' });
    expect(policiesFor(all, false, 'paid')).toMatchObject({ returns: 'ret-none' });
  });

  it('follows the shipping choice it is given', () => {
    expect(policiesFor(all, false, 'free')).toMatchObject({ shipping: 'ship-free' });
    expect(policiesFor(all, false, 'paid')).toMatchObject({ shipping: 'ship-fedex' });
  });

  it('falls back rather than leaving a listing without a policy', () => {
    expect(policiesFor({ ...all, freeShipping: null }, false, 'free')).toMatchObject({ shipping: 'ship-fedex' });
    expect(policiesFor({ ...all, noReturns: null }, false, 'paid')).toMatchObject({ returns: 'ret-motors' });
  });
});

describe('buildPlan', () => {
  it('fills each day before starting the next, beginning tomorrow', async () => {
    sheets.getAllParts.mockResolvedValue(['A', 'B', 'C', 'D'].map((s) => part(s)));

    // NOW is mid-afternoon, so a 9am batch starts tomorrow.
    const plan = await buildPlan(2, 2, 9, NOW);
    const days = plan.items.map((i) => new Date(i.startAt).toDateString());
    expect(new Set(days).size).toBe(2);
    expect(days[0]).toBe(days[1]);
    expect(days[2]).toBe(days[3]);
    expect(new Date(plan.items[0].startAt).getDate()).toBe(24);
    expect(new Date(plan.items[2].startAt).getDate()).toBe(25);
  });

  it('spreads the listings of a day through the hour rather than all at once', async () => {
    sheets.getAllParts.mockResolvedValue(['A', 'B'].map((s) => part(s)));

    const plan = await buildPlan(1, 2, 9, NOW);
    const [first, second] = plan.items.map((i) => new Date(i.startAt));
    expect(first.getHours()).toBe(9);
    expect(first.getMinutes()).toBe(0);
    expect(second.getMinutes()).toBe(30);
  });

  it('takes no more than the batch asked for, and says what is left', async () => {
    sheets.getAllParts.mockResolvedValue(['A', 'B', 'C', 'D', 'E'].map((s) => part(s)));

    const plan = await buildPlan(1, 2, 9, NOW);
    expect(plan.items).toHaveLength(2);
    expect(plan.remaining).toBe(3);
  });

  it('skips parts Copilot has not written up, and counts them', async () => {
    sheets.getAllParts.mockResolvedValue([part('A'), part('B')]);
    folderHolds('A');

    const plan = await buildPlan(1, 10, 9, NOW);
    expect(plan.items.map((i) => i.sku)).toEqual(['A']);
    expect(plan.unresearched).toBe(1);
  });

  it('passes over a research file it cannot read, without stopping the plan', async () => {
    sheets.getAllParts.mockResolvedValue([part('A'), part('B')]);
    research.latestResearch.mockImplementation(async (sku: string) =>
      sku === 'A' ? { found: true, createdAt: '2026-09-22T00:00:00.000Z', notes: [] } : researched('B TITLE')
    );

    const plan = await buildPlan(1, 10, 9, NOW);
    expect(plan.items.map((i) => i.sku)).toEqual(['B']);
  });

  it('leaves out parts that are not ready to list', async () => {
    sheets.getAllParts.mockResolvedValue([
      part('READY'),
      part('LISTED', { itemListed: true, ebayListingId: '123' }),
      part('NOPHOTO', { photographed: false, photos: [] as Photo[] }),
      part('NOCOUNT', { confirmedQoh: undefined }),
    ]);

    const plan = await buildPlan(1, 10, 9, NOW);
    expect(plan.items.map((i) => i.sku)).toEqual(['READY']);
  });

  it('lists the best-ranked stock first', async () => {
    sheets.getAllParts.mockResolvedValue([
      part('LOW', { revenuePriorityRank: 900 }),
      part('TOP', { revenuePriorityRank: 2 }),
      part('MID', { revenuePriorityRank: 50 }),
    ]);

    const plan = await buildPlan(1, 10, 9, NOW);
    expect(plan.items.map((i) => i.sku)).toEqual(['TOP', 'MID', 'LOW']);
  });

  it('picks the policies for each listing: returns by category, postage by weight', async () => {
    sheets.getAllParts.mockResolvedValue([part('A')]);
    research.latestResearch.mockResolvedValue({
      ...researched('A TITLE'),
      listing: { title: 'A TITLE', price: 120, categoryId: '170141', weightLb: 2, titleOptions: [], priceOptions: [], specifics: [] },
    });

    const plan = await buildPlan(1, 10, 9, NOW);
    expect(plan.items[0]).toMatchObject({
      motors: false,
      shipping: 'free',
      policies: { shipping: 'ship-free', returns: 'ret-none', payment: 'pay' },
    });
  });

  it('takes returns on a Motors part, where buyers expect them', async () => {
    sheets.getAllParts.mockResolvedValue([part('A')]);
    publish.resolveCategory.mockResolvedValue({ id: '33615', name: 'Air Dryers', siteId: '100', leaf: true, required: [], recommended: [] });

    const plan = await buildPlan(1, 10, 9, NOW);
    expect(plan.items[0]).toMatchObject({ motors: true, policies: { returns: 'ret-motors' } });
  });

  it('starts on the day it was given', async () => {
    sheets.getAllParts.mockResolvedValue([part('A'), part('B')]);

    const plan = await buildPlan(1, 2, 9, NOW, '2026-09-30');
    expect(new Date(plan.items[0].startAt).getDate()).toBe(30);
    expect(new Date(plan.startsOn).getDate()).toBe(30);
  });

  it('can go out later the same day, when the hour is still ahead', async () => {
    sheets.getAllParts.mockResolvedValue([part('A')]);

    // NOW is 3pm local; a 6pm batch has the notice eBay wants.
    const plan = await buildPlan(1, 1, 18, new Date(2026, 8, 23, 15, 0));
    expect(new Date(plan.items[0].startAt).getDate()).toBe(23);
  });

  it('carries what the reviewer needs to judge each listing', async () => {
    sheets.getAllParts.mockResolvedValue([part('A', { confirmedQoh: 4 })]);

    const [item] = (await buildPlan(1, 10, 9, NOW)).items;
    expect(item).toMatchObject({ sku: 'A', title: 'A TITLE', price: 120, quantity: 4, photos: 1, condition: 'New' });
  });
});
