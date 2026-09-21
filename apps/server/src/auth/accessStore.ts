import { env } from '../config/env.js';
import { getSheetsClient } from '../google/client.js';

/**
 * PIN hashes live in an "Access" tab of the inventory sheet, next to everything else the
 * app keeps — no new database. The tab holds hashes only; a PIN is never written anywhere.
 */

const TAB = 'Access';
const HEADERS = ['name', 'pinHash', 'setAt', 'setBy'];

export interface AccessRecord {
  name: string;
  pinHash: string;
  setAt: string;
  setBy: string;
}

let ready = false;
let cache: { at: number; records: Map<string, AccessRecord> } | undefined;
const CACHE_MS = 30_000;

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
      range: `${TAB}!A1:D1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
  ready = true;
}

const key = (name: string) => name.trim().toLowerCase();

export async function getAccessRecords(): Promise<Map<string, AccessRecord>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.records;
  await ensureTab();
  const res = await getSheetsClient().spreadsheets.values.get({ spreadsheetId: env.googleSheetId, range: `${TAB}!A2:D` });
  const records = new Map<string, AccessRecord>();
  for (const [name, pinHash, setAt, setBy] of (res.data.values ?? []) as string[][]) {
    if (name && pinHash) records.set(key(name), { name, pinHash, setAt: setAt ?? '', setBy: setBy ?? '' });
  }
  cache = { at: Date.now(), records };
  return records;
}

export async function getAccess(name: string): Promise<AccessRecord | undefined> {
  return (await getAccessRecords()).get(key(name));
}

/** Writes or replaces a person's PIN hash. */
export async function setAccess(name: string, pinHash: string, setBy: string): Promise<void> {
  await ensureTab();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.googleSheetId, range: `${TAB}!A2:A` });
  const rows = (res.data.values ?? []) as string[][];
  const index = rows.findIndex((r) => r[0] && key(r[0]) === key(name));
  const values = [[name, pinHash, new Date().toISOString(), setBy]];
  if (index === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: env.googleSheetId,
      range: `${TAB}!A:D`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });
  } else {
    const row = index + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.googleSheetId,
      range: `${TAB}!A${row}:D${row}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
  }
  cache = undefined;
}
