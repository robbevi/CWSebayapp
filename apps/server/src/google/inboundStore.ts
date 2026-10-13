import { randomUUID } from 'node:crypto';
import { normalizeCrate, type InboundItem, type InboundStatus } from '@warehouse/shared';
import { env } from '../config/env.js';
import type { ProfitRow } from '../lib/profitCsv.js';
import { getSheetsClient } from './client.js';

/**
 * Stock on its way to Williston, kept in an "Inbound" tab of the inventory sheet, one row
 * per item per crate.
 *
 * A tab of its own rather than rows in Parts: until a crate is received, nothing about it
 * should reach Williston's cards, counts or listings, and the board never reads this tab.
 */

const TAB = 'Inbound';
const HEADERS = [
  'inboundId',
  'origin',
  'sourceKey',
  'sku',
  'description',
  'manufacturer',
  'originSite',
  'originBin',
  'qty',
  'unitCost',
  'status',
  'crate',
  'packedAt',
  'packedBy',
  'shippedAt',
  'shippedBy',
  'receivedAt',
  'receivedBy',
  'receivedQty',
  'transferId',
  'partId',
  'importedAt',
] as const;
const LAST_COL = String.fromCharCode(64 + HEADERS.length);
const APPEND_CHUNK = 500;

export class InboundError extends Error {}

let ready = false;
let cache: { at: number; items: InboundItem[]; rowOf: Map<string, number> } | undefined;
const CACHE_MS = 10_000;

async function ensureTab(): Promise<void> {
  if (ready) return;
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.googleSheetId, fields: 'sheets.properties.title' });
  if (!meta.data.sheets?.some((s) => s.properties?.title === TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.googleSheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.googleSheetId,
      range: `'${TAB}'!A1:${LAST_COL}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [[...HEADERS]] },
    });
  }
  ready = true;
}

const num = (v: string | undefined) => (v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

function fromRow(row: string[]): InboundItem | null {
  const get = (name: (typeof HEADERS)[number]) => row[HEADERS.indexOf(name)] ?? '';
  if (!get('inboundId') || !get('sku')) return null;
  return {
    id: get('inboundId'),
    origin: get('origin'),
    sourceKey: get('sourceKey'),
    sku: get('sku'),
    description: get('description'),
    manufacturer: get('manufacturer'),
    originSite: get('originSite'),
    originBin: get('originBin'),
    qty: num(get('qty')) ?? 0,
    unitCost: num(get('unitCost')),
    status: (get('status') || 'awaiting') as InboundStatus,
    crate: get('crate'),
    packedAt: get('packedAt') || null,
    packedBy: get('packedBy'),
    shippedAt: get('shippedAt') || null,
    shippedBy: get('shippedBy'),
    receivedAt: get('receivedAt') || null,
    receivedBy: get('receivedBy'),
    receivedQty: num(get('receivedQty')),
    transferId: get('transferId'),
    partId: get('partId'),
    importedAt: get('importedAt') || null,
  };
}

function toRow(i: InboundItem): string[] {
  const value: Record<(typeof HEADERS)[number], unknown> = {
    inboundId: i.id,
    origin: i.origin,
    sourceKey: i.sourceKey,
    sku: i.sku,
    description: i.description,
    manufacturer: i.manufacturer,
    originSite: i.originSite,
    originBin: i.originBin,
    qty: i.qty,
    unitCost: i.unitCost,
    status: i.status,
    crate: i.crate,
    packedAt: i.packedAt,
    packedBy: i.packedBy,
    shippedAt: i.shippedAt,
    shippedBy: i.shippedBy,
    receivedAt: i.receivedAt,
    receivedBy: i.receivedBy,
    receivedQty: i.receivedQty,
    transferId: i.transferId,
    partId: i.partId,
    importedAt: i.importedAt,
  };
  return HEADERS.map((h) => (value[h] == null ? '' : String(value[h])));
}

async function read(fresh = false): Promise<{ items: InboundItem[]; rowOf: Map<string, number> }> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache;
  await ensureTab();
  const res = await getSheetsClient().spreadsheets.values.get({
    spreadsheetId: env.googleSheetId,
    range: `'${TAB}'!A2:${LAST_COL}`,
  });
  const items: InboundItem[] = [];
  const rowOf = new Map<string, number>();
  (res.data.values ?? []).forEach((row, i) => {
    const item = fromRow(row.map(String));
    if (!item) return;
    items.push(item);
    rowOf.set(item.id, i + 2);
  });
  cache = { at: Date.now(), items, rowOf };
  return cache;
}

export async function getInbound(): Promise<InboundItem[]> {
  return (await read()).items;
}

// Writes one at a time, so two people packing at once can't read the same rows and each
// write back over the other.
let queue: Promise<unknown> = Promise.resolve();
function serially<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

async function write(updates: InboundItem[], appends: InboundItem[], clears: number[] = []): Promise<void> {
  const sheets = getSheetsClient();
  const { rowOf } = cache ?? (await read(true));
  const data = [
    ...updates.map((i) => ({ range: `'${TAB}'!A${rowOf.get(i.id)}:${LAST_COL}${rowOf.get(i.id)}`, values: [toRow(i)] })),
    ...clears.map((r) => ({ range: `'${TAB}'!A${r}:${LAST_COL}${r}`, values: [HEADERS.map(() => '')] })),
  ];
  if (data.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: env.googleSheetId,
      requestBody: { valueInputOption: 'RAW', data },
    });
  }
  for (let k = 0; k < appends.length; k += APPEND_CHUNK) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: env.googleSheetId,
      range: `'${TAB}'!A:${LAST_COL}`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: appends.slice(k, k + APPEND_CHUNK).map(toRow) },
    });
  }
  cache = undefined;
}

/**
 * Adds a district's export. Rows already brought in — by their SKU|site key, whatever has
 * happened to them since — are left alone, so the same file can be imported twice safely.
 */
export function importInbound(origin: string, rows: ProfitRow[]): Promise<{ added: number; skipped: number }> {
  return serially(async () => {
    const { items } = await read(true);
    const seen = new Set(items.map((i) => `${i.origin}\u0001${i.sourceKey}`));
    const now = new Date().toISOString();
    const fresh: InboundItem[] = [];
    for (const r of rows) {
      const key = `${origin}\u0001${r.sourceKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fresh.push({
        id: randomUUID(),
        origin,
        ...r,
        status: 'awaiting',
        crate: '',
        packedAt: null,
        packedBy: '',
        shippedAt: null,
        shippedBy: '',
        receivedAt: null,
        receivedBy: '',
        receivedQty: null,
        transferId: '',
        partId: '',
        importedAt: now,
      });
    }
    await write([], fresh);
    return { added: fresh.length, skipped: rows.length - fresh.length };
  });
}

/**
 * Packs items into a crate. Packing fewer than an item's quantity splits it: the packed
 * units go in the crate, the rest stay waiting for the next one.
 */
export function packInbound(crateLabel: string, entries: { id: string; qty?: number }[], who: string): Promise<number> {
  const crate = normalizeCrate(crateLabel);
  if (!crate) return Promise.reject(new InboundError('Give the crate a number.'));
  return serially(async () => {
    const { items } = await read(true);
    const byId = new Map(items.map((i) => [i.id, i]));
    const now = new Date().toISOString();
    const updates: InboundItem[] = [];
    const appends: InboundItem[] = [];
    for (const e of entries) {
      const item = byId.get(e.id);
      if (!item) throw new InboundError('One of those parts is no longer on the list. Refresh and try again.');
      if (item.status !== 'awaiting') throw new InboundError(`${item.sku} is already in crate ${item.crate}.`);
      const qty = e.qty === undefined ? item.qty : Math.trunc(e.qty);
      if (!(qty > 0) || qty > item.qty) throw new InboundError(`${item.sku}: pack between 1 and ${item.qty}.`);
      const packed = { status: 'packed' as const, crate, packedAt: now, packedBy: who };
      if (qty === item.qty) {
        updates.push({ ...item, ...packed });
      } else {
        updates.push({ ...item, qty: item.qty - qty });
        appends.push({ ...item, ...packed, id: randomUUID(), qty });
      }
    }
    await write(updates, appends);
    return entries.length;
  });
}

/**
 * Takes items back out of an open crate. An item split when it was packed rejoins the part
 * of it still waiting, so taking it out undoes the split.
 */
export function unpackInbound(ids: string[]): Promise<number> {
  return serially(async () => {
    const { items, rowOf } = await read(true);
    const byId = new Map(items.map((i) => [i.id, i]));
    const keyOf = (i: InboundItem) => `${i.origin}\u0001${i.sourceKey}`;
    // What is still waiting for each export row, kept current as items come back to it.
    const waiting = new Map(items.filter((i) => i.status === 'awaiting').map((i) => [keyOf(i), i]));
    const updates = new Map<string, InboundItem>();
    const clears: number[] = [];
    for (const id of ids) {
      const item = byId.get(id);
      if (!item || item.status !== 'packed') throw new InboundError('Only parts in a crate that hasn’t shipped can come out.');
      const rest = waiting.get(keyOf(item));
      const back = rest
        ? { ...rest, qty: rest.qty + item.qty }
        : { ...item, status: 'awaiting' as const, crate: '', packedAt: null, packedBy: '' };
      if (rest) clears.push(rowOf.get(item.id)!);
      waiting.set(keyOf(item), back);
      updates.set(back.id, back);
    }
    await write([...updates.values()], [], clears);
    return ids.length;
  });
}

/** Marks a crate shipped: everything packed in it is now on its way. */
export function shipCrate(crateLabel: string, who: string): Promise<number> {
  const crate = normalizeCrate(crateLabel);
  return serially(async () => {
    const { items } = await read(true);
    const inCrate = items.filter((i) => i.crate === crate && i.status === 'packed');
    if (inCrate.length === 0) throw new InboundError(`Crate ${crate} has nothing packed to ship.`);
    const now = new Date().toISOString();
    await write(inCrate.map((i) => ({ ...i, status: 'shipped' as const, shippedAt: now, shippedBy: who })), []);
    return inCrate.length;
  });
}

/** The shipped items of a crate, for receiving. */
export async function shippedIn(crateLabel: string): Promise<InboundItem[]> {
  const crate = normalizeCrate(crateLabel);
  const { items } = await read(true);
  return items.filter((i) => i.crate === crate && i.status === 'shipped');
}

/** Records a crate's items as received, each with what was counted and the part it became. */
export function markReceived(
  received: { id: string; receivedQty: number; partId: string }[],
  transferId: string,
  who: string
): Promise<void> {
  return serially(async () => {
    const { items } = await read(true);
    const byId = new Map(items.map((i) => [i.id, i]));
    const now = new Date().toISOString();
    const updates = received.map((r) => ({
      ...byId.get(r.id)!,
      status: 'received' as const,
      receivedAt: now,
      receivedBy: who,
      receivedQty: r.receivedQty,
      partId: r.partId,
      transferId,
    }));
    await write(updates, []);
  });
}

/** Test seam. */
export function resetInboundStore(): void {
  ready = false;
  cache = undefined;
  queue = Promise.resolve();
}
