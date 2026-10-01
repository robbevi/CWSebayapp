import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A sheet tab held in memory: row 1 is the header, as the store expects. */
const sheet = vi.hoisted(() => ({ rows: [] as string[][], titles: ['Parts'] as string[] }));

const client = vi.hoisted(() => ({
  spreadsheets: {
    get: vi.fn(async () => ({ data: { sheets: sheet.titles.map((title) => ({ properties: { title } })) } })),
    batchUpdate: vi.fn(async () => {
      sheet.titles.push('Listing Drafts');
      return {};
    }),
    values: {
      get: vi.fn(async ({ range }: { range: string }) => {
        const body = sheet.rows.slice(1);
        return { data: { values: range.endsWith('A2:A') ? body.map((r) => [r[0] ?? '']) : body } };
      }),
      update: vi.fn(async ({ range, requestBody }: { range: string; requestBody: { values: string[][] } }) => {
        const row = Number(/A(\d+):/.exec(range)?.[1] ?? 1);
        sheet.rows[row - 1] = requestBody.values[0];
        return {};
      }),
      append: vi.fn(async ({ requestBody }: { requestBody: { values: string[][] } }) => {
        sheet.rows.push(requestBody.values[0]);
        return {};
      }),
      clear: vi.fn(async ({ range }: { range: string }) => {
        const row = Number(/A(\d+):/.exec(range)?.[1] ?? 1);
        sheet.rows[row - 1] = [];
        return {};
      }),
    },
  },
}));

vi.mock('../google/client.js', () => ({ getSheetsClient: () => client }));
vi.mock('../config/env.js', () => ({ env: { googleSheetId: 'sheet' } }));

const { clearDraft, getDraft, saveDraft } = await import('./draftStore.js');

const listing = (price: number) => ({
  title: 'A TITLE',
  titleOptions: [],
  categoryId: '170141',
  price,
  priceOptions: [],
  bestOffer: false,
  descriptionHtml: '<p>part</p>',
  specifics: [],
  weightLb: null,
  weightOz: null,
  lengthIn: null,
  widthIn: null,
  heightIn: null,
});

beforeEach(() => {
  sheet.rows = [['sku', 'listing', 'notes', 'updatedAt', 'updatedBy']];
  vi.clearAllMocks();
});

describe('listing drafts', () => {
  it('saves a draft any device can read back', async () => {
    await saveDraft('p14418', listing(125), ['priced by hand'], 'Rob Bevilacqua');
    const draft = await getDraft('P14418');
    expect(draft).toMatchObject({ sku: 'P14418', notes: ['priced by hand'], updatedBy: 'Rob Bevilacqua' });
    expect(draft?.listing.price).toBe(125);
  });

  it('replaces a SKU’s draft rather than adding a second one', async () => {
    await saveDraft('P14418', listing(100), [], 'Rob Bevilacqua');
    await saveDraft('P14418', listing(125), [], 'Jeremiah Busch');
    expect(sheet.rows.filter((r) => r[0] === 'P14418')).toHaveLength(1);
    expect((await getDraft('P14418'))?.listing.price).toBe(125);
  });

  it('clears a draft so it is no longer read', async () => {
    await saveDraft('P14418', listing(125), [], 'Rob Bevilacqua');
    await clearDraft('P14418');
    expect(await getDraft('P14418')).toBeUndefined();
  });

  it('skips a row someone has mangled rather than failing every read', async () => {
    sheet.rows.push(['BROKEN', '{not json', '[]', '', '']);
    await saveDraft('GOOD', listing(10), [], 'Rob Bevilacqua');
    expect(await getDraft('BROKEN')).toBeUndefined();
    expect(await getDraft('GOOD')).toBeDefined();
  });

  it('refuses a listing too long for a sheet cell, with a reason', async () => {
    const huge = { ...listing(10), descriptionHtml: 'x'.repeat(60_000) };
    await expect(saveDraft('BIG', huge, [], 'Rob Bevilacqua')).rejects.toThrow(/too long/);
  });
});
