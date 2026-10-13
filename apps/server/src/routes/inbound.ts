import { Router, type NextFunction, type Response } from 'express';
import multer from 'multer';
import { isGoogleConfigured } from '../config/env.js';
import {
  getInbound,
  importInbound,
  InboundError,
  markReceived,
  packInbound,
  shipCrate,
  shippedIn,
  unpackInbound,
} from '../google/inboundStore.js';
import { createReceivedParts } from '../google/sheetsService.js';
import { isProfitExport, parseProfitCsv } from '../lib/profitCsv.js';
import { requireAdmin } from '../middleware/auth.js';

/**
 * Stock coming in to Williston from another district (see inboundStore.ts): the export
 * imported, parts packed into crates and shipped by the origin's team, and each crate
 * received in Williston, where every part becomes Williston stock.
 */
export const inboundRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

inboundRouter.use('/inbound', (_req, res, next) => {
  if (isGoogleConfigured()) next();
  else res.status(503).json({ error: 'Inbound stock needs the Google backend.' });
});

function fail(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof InboundError) res.status(400).json({ error: err.message });
  else next(err);
}

inboundRouter.get('/inbound', async (_req, res, next) => {
  try {
    res.json(await getInbound());
  } catch (err) {
    next(err);
  }
});

/** A district's eBay pool, as PROFIT exports it. Admins only: it adds thousands of rows. */
inboundRouter.post('/inbound/import', requireAdmin, upload.single('file'), async (req, res, next) => {
  try {
    const origin = String(req.body?.origin ?? '').trim();
    if (!origin || /^williston$/i.test(origin)) throw new InboundError('Choose the district the stock is coming from.');
    if (!req.file) throw new InboundError('Choose the CSV file to import.');
    const text = req.file.buffer.toString('utf-8');
    if (!isProfitExport(text)) {
      throw new InboundError('That file isn’t a PROFIT eBay pool export (it needs InvSite and Sum of Current Qty columns).');
    }
    const rows = parseProfitCsv(text);
    res.json({ ...(await importInbound(origin, rows)), rows: rows.length });
  } catch (err) {
    fail(err, res, next);
  }
});

inboundRouter.post('/inbound/pack', async (req, res, next) => {
  try {
    const crate = String(req.body?.crate ?? '');
    const items = Array.isArray(req.body?.items) ? (req.body.items as { id?: unknown; qty?: unknown }[]) : [];
    if (items.length === 0) throw new InboundError('Choose the parts to pack.');
    const entries = items.map((i) => ({
      id: String(i.id ?? ''),
      qty: i.qty === undefined || i.qty === null || i.qty === '' ? undefined : Number(i.qty),
    }));
    res.json({ packed: await packInbound(crate, entries, req.user!.name) });
  } catch (err) {
    fail(err, res, next);
  }
});

inboundRouter.post('/inbound/unpack', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(String) : [];
    if (ids.length === 0) throw new InboundError('Choose the parts to take out.');
    res.json({ unpacked: await unpackInbound(ids) });
  } catch (err) {
    fail(err, res, next);
  }
});

inboundRouter.post('/inbound/ship', async (req, res, next) => {
  try {
    res.json({ shipped: await shipCrate(String(req.body?.crate ?? ''), req.user!.name) });
  } catch (err) {
    fail(err, res, next);
  }
});

interface ReceiveLine {
  id: string;
  receivedQty: number;
  binLocation: string;
  newBinLocation: string;
}

/**
 * Receives a whole crate into Williston: the Cetaris transfer that moved it, the site it
 * goes into, and for each part what was counted and where it was put. Every part counted
 * becomes a Williston part, joining that SKU's card if Williston already has one.
 */
inboundRouter.post('/inbound/receive', async (req, res, next) => {
  try {
    const crate = String(req.body?.crate ?? '');
    const transferId = String(req.body?.transferId ?? '').trim();
    const site = String(req.body?.site ?? '').trim();
    if (!transferId) throw new InboundError('Enter the Cetaris transfer number.');
    if (!site) throw new InboundError('Choose the Williston site the crate goes into.');

    const lines: ReceiveLine[] = (Array.isArray(req.body?.items) ? (req.body.items as Record<string, unknown>[]) : []).map((l) => ({
      id: String(l.id ?? ''),
      receivedQty: Math.trunc(Number(l.receivedQty)),
      binLocation: String(l.binLocation ?? '').trim(),
      newBinLocation: String(l.newBinLocation ?? '').trim(),
    }));
    const shipped = await shippedIn(crate);
    if (shipped.length === 0) throw new InboundError('That crate has nothing waiting to be received.');
    const byId = new Map(lines.map((l) => [l.id, l]));
    for (const item of shipped) {
      const line = byId.get(item.id);
      if (!line) throw new InboundError(`${item.sku} is missing from what was received. Receive the whole crate at once.`);
      if (!Number.isFinite(line.receivedQty) || line.receivedQty < 0) throw new InboundError(`${item.sku}: enter how many arrived.`);
      if (line.receivedQty > 0 && !line.binLocation) throw new InboundError(`${item.sku}: enter the bin it went into.`);
    }

    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
    const counted = shipped.filter((i) => byId.get(i.id)!.receivedQty > 0);
    const partIds = await createReceivedParts(
      counted.map((i) => {
        const line = byId.get(i.id)!;
        return {
          sku: i.sku,
          description: i.description,
          manufacturer: i.manufacturer,
          inventorySite: site,
          binLocation: line.binLocation,
          newBinLocation: line.newBinLocation || undefined,
          qoh: line.receivedQty,
          origin: i.origin,
          unitCost: i.unitCost,
          notes: `Received from ${i.origin} in crate ${i.crate}, Cetaris transfer ${transferId}, ${today}.`,
        };
      })
    );
    const partOf = new Map(counted.map((i, k) => [i.id, partIds[k]!]));
    await markReceived(
      shipped.map((i) => ({ id: i.id, receivedQty: byId.get(i.id)!.receivedQty, partId: partOf.get(i.id) ?? '' })),
      transferId,
      req.user!.name
    );
    res.json({ received: shipped.length, parts: partIds.length });
  } catch (err) {
    fail(err, res, next);
  }
});
