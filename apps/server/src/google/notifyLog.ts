import { env } from '../config/env.js';
import { getSheetsClient } from './client.js';

/**
 * Which once-a-day emails have gone out, kept in a "Notifications" tab of the inventory
 * sheet: one row per email, keyed like "ship-reminder:2026-10-08".
 *
 * In the sheet rather than in memory because the server restarts whenever the host wakes
 * it, and a reminder remembered only in memory would go out again with every restart.
 */

const TAB = 'Notifications';
const HEADERS = ['key', 'sentAt', 'detail'];

let ready = false;
/** Keys known sent, so a key is read from the sheet at most once per run. */
const known = new Set<string>();

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
      range: `'${TAB}'!A1:C1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
  ready = true;
}

export async function wasSent(key: string): Promise<boolean> {
  if (known.has(key)) return true;
  await ensureTab();
  const res = await getSheetsClient().spreadsheets.values.get({
    spreadsheetId: env.googleSheetId,
    range: `'${TAB}'!A2:A`,
  });
  for (const [k] of res.data.values ?? []) if (k) known.add(String(k));
  return known.has(key);
}

export async function markSent(key: string, detail = ''): Promise<void> {
  await ensureTab();
  await getSheetsClient().spreadsheets.values.append({
    spreadsheetId: env.googleSheetId,
    range: `'${TAB}'!A:C`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[key, new Date().toISOString(), detail]] },
  });
  known.add(key);
}

/** Test seam. */
export function resetNotifyLog(): void {
  ready = false;
  known.clear();
}
