import { coerceAgentListing, type AgentListing } from '@warehouse/shared';
import { env } from '../config/env.js';
import { getSheetsClient } from '../google/client.js';

/**
 * Listings someone has edited but not yet published, kept in a "Listing Drafts" tab of the
 * inventory sheet.
 *
 * They used to live in the browser they were edited in, so a price set on the warehouse
 * tablet never reached a batch planned at a desk. Here every device sees the same draft,
 * and the batch planner reads it too. One row per SKU; publishing clears it.
 */

const TAB = 'Listing Drafts';
const HEADERS = ['sku', 'listing', 'notes', 'updatedAt', 'updatedBy'];
/** Google Sheets refuses a cell over 50,000 characters; a little headroom below that. */
const MAX_CELL = 48_000;

export interface ListingDraft {
  sku: string;
  listing: AgentListing;
  notes: string[];
  updatedAt: string;
  updatedBy: string;
}

let ready = false;
let cache: { at: number; drafts: Map<string, ListingDraft> } | undefined;
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
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.googleSheetId,
      range: `'${TAB}'!A1:E1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
  ready = true;
}

const key = (sku: string) => sku.trim().toUpperCase();

function parse(row: string[]): ListingDraft | null {
  const [sku, listingJson, notesJson, updatedAt, updatedBy] = row;
  if (!sku || !listingJson) return null;
  try {
    const notes = notesJson ? (JSON.parse(notesJson) as unknown) : [];
    return {
      sku,
      // Coerced on the way out, so a draft written by an older build still reads whole.
      listing: coerceAgentListing(JSON.parse(listingJson)),
      notes: Array.isArray(notes) ? notes.filter((n): n is string => typeof n === 'string') : [],
      updatedAt: updatedAt ?? '',
      updatedBy: updatedBy ?? '',
    };
  } catch {
    // A row someone hand-edited into nonsense is skipped rather than failing every read.
    return null;
  }
}

export async function getDrafts(): Promise<Map<string, ListingDraft>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.drafts;
  await ensureTab();
  const res = await getSheetsClient().spreadsheets.values.get({
    spreadsheetId: env.googleSheetId,
    range: `'${TAB}'!A2:E`,
  });
  const drafts = new Map<string, ListingDraft>();
  for (const row of (res.data.values ?? []) as string[][]) {
    const draft = parse(row);
    if (draft) drafts.set(key(draft.sku), draft);
  }
  cache = { at: Date.now(), drafts };
  return drafts;
}

export async function getDraft(sku: string): Promise<ListingDraft | undefined> {
  return (await getDrafts()).get(key(sku));
}

async function rowOf(sku: string): Promise<number | null> {
  const res = await getSheetsClient().spreadsheets.values.get({
    spreadsheetId: env.googleSheetId,
    range: `'${TAB}'!A2:A`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const index = rows.findIndex((r) => r[0] && key(r[0]) === key(sku));
  return index === -1 ? null : index + 2;
}

export class DraftTooLargeError extends Error {}

/** Writes or replaces a SKU's draft. */
export async function saveDraft(sku: string, listing: AgentListing, notes: string[], who: string): Promise<ListingDraft> {
  await ensureTab();
  const listingJson = JSON.stringify(listing);
  if (listingJson.length > MAX_CELL) {
    throw new DraftTooLargeError('This listing is too long to save as a draft. Shorten the description.');
  }
  const draft: ListingDraft = { sku: key(sku), listing, notes, updatedAt: new Date().toISOString(), updatedBy: who };
  const values = [[draft.sku, listingJson, JSON.stringify(notes), draft.updatedAt, draft.updatedBy]];
  const sheets = getSheetsClient();
  const row = await rowOf(sku);
  if (row == null) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: env.googleSheetId,
      range: `'${TAB}'!A:E`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });
  } else {
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.googleSheetId,
      range: `'${TAB}'!A${row}:E${row}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
  }
  cache = undefined;
  return draft;
}

/** Clears a SKU's draft: once it is listed, or when someone starts over. */
export async function clearDraft(sku: string): Promise<void> {
  await ensureTab();
  const row = await rowOf(sku);
  if (row == null) return;
  // Blanked rather than deleted: deleting shifts every row below, and a save running at
  // the same moment would then overwrite the wrong one.
  await getSheetsClient().spreadsheets.values.clear({
    spreadsheetId: env.googleSheetId,
    range: `'${TAB}'!A${row}:E${row}`,
  });
  cache = undefined;
}
