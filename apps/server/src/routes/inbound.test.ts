import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboundItem } from '@warehouse/shared';

const store = vi.hoisted(() => ({
  getInbound: vi.fn(),
  importInbound: vi.fn(),
  packInbound: vi.fn(),
  unpackInbound: vi.fn(),
  shipCrate: vi.fn(),
  shippedIn: vi.fn(async (): Promise<InboundItem[]> => []),
  markReceived: vi.fn(),
  InboundError: class InboundError extends Error {},
}));
const sheets = vi.hoisted(() => ({ createReceivedParts: vi.fn(async (items: unknown[]) => items.map((_, k) => `part-${k + 1}`)) }));

vi.mock('../google/inboundStore.js', () => store);
vi.mock('../google/sheetsService.js', () => sheets);
vi.mock('../config/env.js', () => ({ isGoogleConfigured: () => true }));
vi.mock('../middleware/auth.js', () => ({ requireAdmin: (_q: unknown, _s: unknown, next: () => void) => next() }));

const { inboundRouter } = await import('./inbound.js');

const item = (id: string, sku: string, qty: number): InboundItem => ({
  id,
  origin: 'Grand Junction',
  sourceKey: `${sku}|GJPARTS`,
  sku,
  description: `PART ${sku}`,
  manufacturer: 'Acme',
  originSite: 'GJPARTS',
  originBin: 'A-1',
  qty,
  unitCost: 0.12,
  status: 'shipped',
  crate: 'GJ-001',
  packedAt: null,
  packedBy: '',
  shippedAt: null,
  shippedBy: '',
  receivedAt: null,
  receivedBy: '',
  receivedQty: null,
  transferId: '',
  partId: '',
  importedAt: null,
});

let base = '';
let server: ReturnType<express.Express['listen']>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { name: 'Jo', role: 'warehouse' };
    next();
  });
  app.use('/api', inboundRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(() => server.close());

beforeEach(() => vi.clearAllMocks());

const receive = (body: unknown) =>
  fetch(`${base}/inbound/receive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('receiving a crate', () => {
  it('turns each part counted into a Williston part, and records the crate received', async () => {
    store.shippedIn.mockResolvedValueOnce([item('a', '236577BXW', 26), item('b', 'LOST-1', 1)]);
    const res = await receive({
      crate: 'GJ-001',
      transferId: 'T-55',
      site: 'NDPARTS',
      items: [
        { id: 'a', receivedQty: 25, recoveryBin: 'A-1-3' },
        { id: 'b', receivedQty: 0, recoveryBin: '' },
      ],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: 2, parts: 1 });

    const [created] = sheets.createReceivedParts.mock.calls[0] as unknown as [Record<string, unknown>[]];
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      sku: '236577BXW',
      inventorySite: 'NDPARTS',
      newBinLocation: 'A-1-3',
      qoh: 25,
      origin: 'Grand Junction',
      unitCost: 0.12,
    });
    expect(String(created[0].notes)).toMatch(/^Received from Grand Junction in crate GJ-001, Cetaris transfer T-55, /);

    expect(store.markReceived).toHaveBeenCalledWith(
      [
        { id: 'a', receivedQty: 25, partId: 'part-1' },
        { id: 'b', receivedQty: 0, partId: '' },
      ],
      'T-55',
      'Jo'
    );
  });

  it('needs the transfer number, the site, and a recovery bin for everything that arrived', async () => {
    store.shippedIn.mockResolvedValue([item('a', 'A', 2)]);
    expect((await receive({ crate: 'GJ-001', site: 'NDPARTS', items: [] })).status).toBe(400);
    expect((await receive({ crate: 'GJ-001', transferId: 'T', items: [] })).status).toBe(400);
    const noBin = await receive({ crate: 'GJ-001', transferId: 'T', site: 'NDPARTS', items: [{ id: 'a', receivedQty: 2, recoveryBin: '' }] });
    expect((await noBin.json()).error).toMatch(/A: enter the recovery bin/);
    const partial = await receive({ crate: 'GJ-001', transferId: 'T', site: 'NDPARTS', items: [] });
    expect((await partial.json()).error).toMatch(/Receive the whole crate/);
    expect(sheets.createReceivedParts).not.toHaveBeenCalled();
    store.shippedIn.mockReset();
  });
});
