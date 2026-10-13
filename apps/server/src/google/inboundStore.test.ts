import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfitRow } from '../lib/profitCsv.js';

/** A fake Inbound tab: rows as the Sheets API would hold them. */
const sheet = vi.hoisted(() => ({ rows: [] as string[][], hasTab: true }));

const client = vi.hoisted(() => ({
  spreadsheets: {
    get: vi.fn(async () => ({ data: { sheets: [{ properties: { title: 'Inbound' } }] } })),
    batchUpdate: vi.fn(),
    values: {
      get: vi.fn(async () => ({ data: { values: sheet.rows.map((r) => [...r]) } })),
      update: vi.fn(),
      append: vi.fn(async ({ requestBody }: { requestBody: { values: string[][] } }) => {
        sheet.rows.push(...requestBody.values.map((r) => [...r]));
      }),
      batchUpdate: vi.fn(async ({ requestBody }: { requestBody: { data: { range: string; values: string[][] }[] } }) => {
        for (const d of requestBody.data) {
          const row = Number(/!A(\d+):/.exec(d.range)![1]);
          sheet.rows[row - 2] = [...d.values[0]];
        }
      }),
    },
  },
}));

vi.mock('./client.js', () => ({ getSheetsClient: () => client }));
vi.mock('../config/env.js', () => ({ env: { googleSheetId: 'sheet' } }));

const store = await import('./inboundStore.js');

const row = (sku: string, qty: number, site = 'GJPARTS'): ProfitRow => ({
  sourceKey: `${sku}|${site}`,
  sku,
  description: `PART ${sku}`,
  manufacturer: 'Acme',
  originSite: site,
  originBin: 'A-1',
  qty,
  unitCost: 1.5,
});

beforeEach(() => {
  sheet.rows = [];
  store.resetInboundStore();
});

describe('inbound stock', () => {
  it('imports a district export once, however many times it is run', async () => {
    expect(await store.importInbound('Grand Junction', [row('A', 2), row('B', 5)])).toEqual({ added: 2, skipped: 0 });
    expect(await store.importInbound('Grand Junction', [row('A', 2), row('C', 1)])).toEqual({ added: 1, skipped: 1 });
    const items = await store.getInbound();
    expect(items.map((i) => i.sku).sort()).toEqual(['A', 'B', 'C']);
    expect(items.every((i) => i.status === 'awaiting' && i.origin === 'Grand Junction')).toBe(true);
  });

  it('packs a whole item, or splits it when only some of it goes', async () => {
    await store.importInbound('Grand Junction', [row('A', 2), row('B', 26)]);
    const [a, b] = await store.getInbound();
    await store.packInbound('gj-001', [{ id: a.id }, { id: b.id, qty: 10 }], 'Pat');
    const items = await store.getInbound();
    const packed = items.filter((i) => i.status === 'packed');
    expect(packed.map((i) => [i.sku, i.qty, i.crate, i.packedBy])).toEqual([
      ['A', 2, 'GJ-001', 'Pat'],
      ['B', 10, 'GJ-001', 'Pat'],
    ]);
    expect(items.find((i) => i.status === 'awaiting' && i.sku === 'B')!.qty).toBe(16);
  });

  it('refuses to pack more than there is, or a part already packed', async () => {
    await store.importInbound('Grand Junction', [row('A', 2)]);
    const [a] = await store.getInbound();
    await expect(store.packInbound('GJ-1', [{ id: a.id, qty: 3 }], 'Pat')).rejects.toThrow(/between 1 and 2/);
    await store.packInbound('GJ-1', [{ id: a.id }], 'Pat');
    await expect(store.packInbound('GJ-2', [{ id: a.id }], 'Pat')).rejects.toThrow(/already in crate GJ-1/);
  });

  it('puts a split item back together when it comes out of the crate', async () => {
    await store.importInbound('Grand Junction', [row('B', 26)]);
    const [b] = await store.getInbound();
    await store.packInbound('GJ-001', [{ id: b.id, qty: 10 }], 'Pat');
    const packed = (await store.getInbound()).find((i) => i.status === 'packed')!;
    await store.unpackInbound([packed.id]);
    const items = await store.getInbound();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ sku: 'B', qty: 26, status: 'awaiting', crate: '' });
  });

  it('ships a crate, then records it received', async () => {
    await store.importInbound('Grand Junction', [row('A', 2)]);
    const [a] = await store.getInbound();
    await store.packInbound('GJ-001', [{ id: a.id }], 'Pat');
    await expect(store.shipCrate('GJ-002', 'Pat')).rejects.toThrow(/nothing packed/);
    expect(await store.shipCrate('gj-001', 'Pat')).toBe(1);
    const shipped = await store.shippedIn('GJ-001');
    expect(shipped[0]).toMatchObject({ status: 'shipped', shippedBy: 'Pat' });
    await store.markReceived([{ id: a.id, receivedQty: 2, partId: 'part-1' }], 'T-55', 'Jo');
    expect((await store.getInbound())[0]).toMatchObject({
      status: 'received',
      receivedQty: 2,
      partId: 'part-1',
      transferId: 'T-55',
      receivedBy: 'Jo',
    });
  });
});
