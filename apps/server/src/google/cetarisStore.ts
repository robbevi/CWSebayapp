import type { CetarisLog } from '@warehouse/shared';
import { env } from '../config/env.js';
import { getSheetsClient } from './client.js';

/**
 * Cetaris Part Sale numbers, kept in a "Cetaris Sales" tab of the inventory sheet, one row
 * per eBay sale.
 *
 * A tab of their own rather than columns on Sales: the eBay sync rewrites each sales row
 * from eBay, and a number someone typed must never be at the mercy of that. Keyed on eBay's
 * line item id, the same key the sync uses, so a resync can't double or orphan one.
 */

const TAB = 'Cetaris Sales';
const HEADERS = ['lineItemId', 'cetarisSaleNumber', 'sku', 'loggedAt', 'loggedBy', 'completedAt', 'completedBy'];

let ready = false;
let cache: { at: number; logs: Map<string, CetarisLog> } | undefined;
const CACHE_MS = 15_000;

async function ensureTab(): Promise<void> {
  if (ready) return;
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.googleSheetId, fields: 'sheets.properties.title' });
  if (!meta.data.sheets?.some((s) => s.properties?.title === TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.googleSheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } } }] },
    });
  }
  // Written every time the tab is first touched, which also widens a tab made before the
  // completion columns existed. The names never change, so rewriting them is harmless.
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `'${TAB}'!A1:G1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  });
  ready = true;
}

/** Every logged Cetaris number, by eBay line item. */
export async function getCetarisLogs(): Promise<Map<string, CetarisLog>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.logs;
  await ensureTab();
  const res = await getSheetsClient().spreadsheets.values.get({
    spreadsheetId: env.googleSheetId,
    range: `'${TAB}'!A2:G`,
  });
  const logs = new Map<string, CetarisLog>();
  for (const [lineItemId, cetarisSaleNumber, , loggedAt, loggedBy, completedAt, completedBy] of (res.data.values ?? []) as string[][]) {
    if (lineItemId && cetarisSaleNumber) {
      logs.set(lineItemId, {
        lineItemId,
        cetarisSaleNumber,
        loggedAt: loggedAt ?? '',
        loggedBy: loggedBy ?? '',
        completedAt: completedAt ?? '',
        completedBy: completedBy ?? '',
      });
    }
  }
  cache = { at: Date.now(), logs };
  return logs;
}

/**
 * Logs one Part Sale number against any number of eBay sales — often several, since one
 * Part Sale can cover many sales, of several SKUs. Starting a Part Sale in Cetaris is what
 * gives the number, so a logged sale is Pending until the Part Sale is completed. A sale
 * that already has a number gets the new one: correcting a typo is the same act as logging
 * it, and leaves any completion as it was.
 */
export async function logCetaris(
  sales: { lineItemId: string; sku: string }[],
  cetarisSaleNumber: string,
  who: string
): Promise<number> {
  await ensureTab();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.googleSheetId, range: `'${TAB}'!A2:A` });
  const rowOf = new Map<string, number>();
  ((res.data.values ?? []) as string[][]).forEach((r, i) => {
    if (r[0]) rowOf.set(r[0], i + 2);
  });

  const loggedAt = new Date().toISOString();
  const updates: { range: string; values: string[][] }[] = [];
  const appends: string[][] = [];
  for (const sale of sales) {
    const values = [sale.lineItemId, cetarisSaleNumber, sale.sku, loggedAt, who];
    const row = rowOf.get(sale.lineItemId);
    if (row) updates.push({ range: `'${TAB}'!A${row}:E${row}`, values: [values] });
    else appends.push(values);
  }

  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: env.googleSheetId,
      requestBody: { valueInputOption: 'RAW', data: updates },
    });
  }
  if (appends.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: env.googleSheetId,
      range: `'${TAB}'!A:E`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: appends },
    });
  }
  cache = undefined;
  return sales.length;
}

/** Takes a number back off a sale, for one logged against the wrong sale. */
export async function clearCetaris(lineItemId: string): Promise<void> {
  await ensureTab();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.googleSheetId, range: `'${TAB}'!A2:A` });
  const index = ((res.data.values ?? []) as string[][]).findIndex((r) => r[0] === lineItemId);
  if (index === -1) return;
  // Blanked rather than deleted, so a log running at the same moment can't land on the
  // wrong row once the rows below have shifted up.
  await sheets.spreadsheets.values.clear({
    spreadsheetId: env.googleSheetId,
    range: `'${TAB}'!A${index + 2}:G${index + 2}`,
  });
  cache = undefined;
}

/**
 * Marks a Part Sale completed in Cetaris — or, with `done` false, back to Pending — for
 * every sale logged under its number, since completing one Part Sale completes all it
 * covers. Returns how many sales that was.
 */
export async function setCetarisCompleted(cetarisSaleNumber: string, who: string, done = true): Promise<number> {
  await ensureTab();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.googleSheetId, range: `'${TAB}'!A2:B` });
  const rows = ((res.data.values ?? []) as string[][])
    .map((r, i) => ({ number: r[1], row: i + 2, lineItemId: r[0] }))
    .filter((r) => r.lineItemId && r.number === cetarisSaleNumber);
  if (rows.length === 0) return 0;
  const stamp = done ? [new Date().toISOString(), who] : ['', ''];
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: env.googleSheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: rows.map((r) => ({ range: `'${TAB}'!F${r.row}:G${r.row}`, values: [stamp] })),
    },
  });
  cache = undefined;
  return rows.length;
}
