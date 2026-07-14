import { deriveStatus, isWinForRole, roleForUser } from '@warehouse/shared';
import type { InventoryPart, InventoryPartPatch, Photo, Submission } from '@warehouse/shared';
import { env } from '../config/env.js';
import { parseBoolean, parseDateOrNull, parseNumberOrNull } from '../lib/csv.js';
import { getSheetsClient } from './client.js';
import { listPhotosGroupedBySku } from './driveService.js';

const SHEET_NAME = 'Parts';
const SUBMISSIONS_SHEET = 'Submissions';
const SUBMISSIONS_HEADERS = ['sku', 'user', 'role', 'completedAt'];

const KNOWN_FIELDS = [
  'sku',
  'description',
  'manufacturer',
  'inventorySite',
  'binLocation',
  'qoh',
  'confirmedQoh',
  'notes',
  'itemCondition',
  'boxCondition',
  'disposition',
  'dispositionNote',
  'photographed',
  'itemListed',
  'itemListedDate',
  'ebayListingId',
  'transferredToMarketRecovery',
  'transferId',
  'catalogingStartDate',
  'legacyPartId',
  'importSequenceNumber',
  'updatedAt',
] as const;
type FieldName = (typeof KNOWN_FIELDS)[number];

export interface CreatePartFields {
  sku: string;
  description?: string;
  manufacturer?: string;
  inventorySite?: string;
  binLocation?: string;
  qoh?: number;
  confirmedQoh?: number | null;
  itemCondition?: string;
  boxCondition?: string;
  disposition?: string;
  dispositionNote?: string;
  notes?: string;
  itemListed?: boolean;
  itemListedDate?: string | null;
  ebayListingId?: string | null;
  transferredToMarketRecovery?: boolean;
  transferId?: string | null;
  catalogingStartDate?: string | null;
  legacyPartId?: string;
  importSequenceNumber?: number | null;
}

function cellToString(value: unknown): string | undefined {
  return value === undefined || value === null || value === '' ? undefined : String(value);
}

function colLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function mapRowToPart(headers: string[], row: unknown[], photos: Photo[]): InventoryPart {
  const get = (name: FieldName): string | undefined => {
    const i = headers.indexOf(name);
    return i === -1 ? undefined : cellToString(row[i]);
  };

  const sku = (get('sku') ?? '').trim();

  const base = {
    id: sku,
    sku,
    description: get('description') ?? '',
    manufacturer: get('manufacturer') ?? '',
    inventorySite: get('inventorySite') ?? '',
    binLocation: get('binLocation') ?? '',
    qoh: parseNumberOrNull(get('qoh')) ?? 0,
    confirmedQoh: parseNumberOrNull(get('confirmedQoh')),
    notes: get('notes'),
    itemCondition: get('itemCondition'),
    boxCondition: get('boxCondition'),
    disposition: get('disposition'),
    dispositionNote: get('dispositionNote'),
    photographed: parseBoolean(get('photographed')) || photos.length > 0,
    itemListed: parseBoolean(get('itemListed')),
    itemListedDate: parseDateOrNull(get('itemListedDate')),
    ebayListingId: get('ebayListingId') ?? null,
    transferredToMarketRecovery: parseBoolean(get('transferredToMarketRecovery')),
    transferId: get('transferId') ?? null,
    catalogingStartDate: parseDateOrNull(get('catalogingStartDate')),
    legacyPartId: get('legacyPartId'),
    importSequenceNumber: parseNumberOrNull(get('importSequenceNumber')),
    photos,
    updatedAt: get('updatedAt'),
  };

  return { ...base, workflowStatus: deriveStatus(base) };
}

function serializeValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

function recordToRow(headers: string[], record: Partial<Record<FieldName, unknown>>): string[] {
  return headers.map((h) => (h in record ? serializeValue(record[h as FieldName]) : ''));
}

export async function checkAccess(): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.get({ spreadsheetId: env.googleSheetId });
}

let cachedSheetId: number | undefined;

async function getSheetId(): Promise<number> {
  if (cachedSheetId !== undefined) return cachedSheetId;
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId: env.googleSheetId, fields: 'sheets.properties' });
  const sheet = res.data.sheets?.find((s) => s.properties?.title === SHEET_NAME);
  if (sheet?.properties?.sheetId == null) throw new Error(`Sheet "${SHEET_NAME}" was not found in the spreadsheet.`);
  cachedSheetId = sheet.properties.sheetId;
  return cachedSheetId;
}

async function readSheet(): Promise<{ headers: string[]; rows: unknown[][] }> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.googleSheetId, range: SHEET_NAME });
  const values = res.data.values ?? [];
  const [headers = [], ...rows] = values;
  return { headers, rows };
}

// Cheap alternative to readSheet() for callers that only need the header row (e.g.
// bulk-creating many rows) — reading the whole (growing) sheet once per created row
// would be O(n^2) for a large import.
async function getHeaders(): Promise<string[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.googleSheetId, range: `${SHEET_NAME}!1:1` });
  return res.data.values?.[0] ?? [];
}

function buildCreateRecord(data: CreatePartFields, updatedAt: string): Partial<Record<FieldName, unknown>> {
  return {
    sku: data.sku,
    description: data.description,
    manufacturer: data.manufacturer,
    inventorySite: data.inventorySite,
    binLocation: data.binLocation,
    qoh: data.qoh,
    confirmedQoh: data.confirmedQoh,
    itemCondition: data.itemCondition,
    boxCondition: data.boxCondition,
    disposition: data.disposition,
    dispositionNote: data.dispositionNote,
    notes: data.notes,
    photographed: false,
    itemListed: data.itemListed ?? false,
    itemListedDate: data.itemListedDate,
    ebayListingId: data.ebayListingId,
    transferredToMarketRecovery: data.transferredToMarketRecovery ?? false,
    transferId: data.transferId,
    catalogingStartDate: data.catalogingStartDate,
    legacyPartId: data.legacyPartId,
    importSequenceNumber: data.importSequenceNumber,
    updatedAt,
  };
}

function findRow(headers: string[], rows: unknown[][], sku: string): { rowNumber: number; row: unknown[] } | undefined {
  const skuCol = headers.indexOf('sku');
  if (skuCol === -1) return undefined;
  const index = rows.findIndex((r) => cellToString(r[skuCol])?.trim().toUpperCase() === sku.toUpperCase());
  if (index === -1) return undefined;
  return { rowNumber: index + 2, row: rows[index] };
}

export async function getAllParts(): Promise<InventoryPart[]> {
  const { headers, rows } = await readSheet();
  const photosBySku = await listPhotosGroupedBySku();
  return rows
    .filter((row) => row.some((cell) => cellToString(cell) !== undefined))
    .map((row) => {
      const sku = cellToString(row[headers.indexOf('sku')])?.trim().toUpperCase() ?? '';
      return mapRowToPart(headers, row, photosBySku.get(sku) ?? []);
    });
}

export async function getPartBySku(sku: string): Promise<InventoryPart> {
  const { headers, rows } = await readSheet();
  const found = findRow(headers, rows, sku);
  if (!found) throw new Error(`Part with SKU "${sku}" was not found in the Google Sheet.`);
  const photosBySku = await listPhotosGroupedBySku();
  return mapRowToPart(headers, found.row, photosBySku.get(sku.toUpperCase()) ?? []);
}

let submissionsSheetReady = false;

// Creates the "Submissions" tab (with a header row) the first time it's needed, so
// tracking works without anyone having to manually prep the spreadsheet first.
async function ensureSubmissionsSheet(): Promise<void> {
  if (submissionsSheetReady) return;
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId: env.googleSheetId, fields: 'sheets.properties' });
  const exists = res.data.sheets?.some((s) => s.properties?.title === SUBMISSIONS_SHEET);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.googleSheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: SUBMISSIONS_SHEET } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.googleSheetId,
      range: `${SUBMISSIONS_SHEET}!A1:D1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [SUBMISSIONS_HEADERS] },
    });
  }
  submissionsSheetReady = true;
}

async function appendSubmission(submission: Submission): Promise<void> {
  await ensureSubmissionsSheet();
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: env.googleSheetId,
    range: SUBMISSIONS_SHEET,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[submission.sku, submission.user, submission.role, submission.completedAt]] },
  });
}

export async function getSubmissions(): Promise<Submission[]> {
  await ensureSubmissionsSheet();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.googleSheetId, range: SUBMISSIONS_SHEET });
  const [, ...rows] = res.data.values ?? [];
  return rows
    .filter((row) => row.length > 0 && row[0])
    .map((row) => ({
      sku: String(row[0] ?? ''),
      user: String(row[1] ?? ''),
      role: String(row[2] ?? '') as Submission['role'],
      completedAt: String(row[3] ?? ''),
    }));
}

export async function updatePart(sku: string, patch: InventoryPartPatch, submittedBy?: string): Promise<InventoryPart> {
  const sheets = getSheetsClient();
  const { headers, rows } = await readSheet();
  const found = findRow(headers, rows, sku);
  if (!found) throw new Error(`Part with SKU "${sku}" was not found in the Google Sheet.`);
  const before = mapRowToPart(headers, found.row, []);

  const record: Partial<Record<FieldName, unknown>> = {};
  headers.forEach((h, i) => {
    if (KNOWN_FIELDS.includes(h as FieldName)) record[h as FieldName] = cellToString(found.row[i]);
  });

  if (patch.confirmedQoh !== undefined) record.confirmedQoh = patch.confirmedQoh;
  if (patch.notes !== undefined) record.notes = patch.notes;
  if (patch.itemCondition !== undefined) record.itemCondition = patch.itemCondition;
  if (patch.boxCondition !== undefined) record.boxCondition = patch.boxCondition;
  if (patch.disposition !== undefined) record.disposition = patch.disposition;
  if (patch.dispositionNote !== undefined) record.dispositionNote = patch.dispositionNote;
  if (patch.photographed !== undefined) record.photographed = patch.photographed;
  if (patch.itemListed !== undefined) record.itemListed = patch.itemListed;
  if (patch.itemListedDate !== undefined) record.itemListedDate = patch.itemListedDate;
  if (patch.ebayListingId !== undefined) record.ebayListingId = patch.ebayListingId;
  if (patch.transferredToMarketRecovery !== undefined) record.transferredToMarketRecovery = patch.transferredToMarketRecovery;
  if (patch.transferId !== undefined) record.transferId = patch.transferId;
  if (patch.catalogingStartDate !== undefined) record.catalogingStartDate = patch.catalogingStartDate;
  record.updatedAt = new Date().toISOString();

  const lastCol = colLetter(headers.length - 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `${SHEET_NAME}!A${found.rowNumber}:${lastCol}${found.rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [recordToRow(headers, record)] },
  });

  const role = submittedBy ? roleForUser(env.appUsers, submittedBy) : undefined;
  if (role) {
    const after = mapRowToPart(headers, recordToRow(headers, record), []);
    if (!isWinForRole(role, before) && isWinForRole(role, after)) {
      await appendSubmission({ sku, user: submittedBy!, role, completedAt: new Date().toISOString() });
    }
  }

  return getPartBySku(sku);
}

export async function deletePart(sku: string): Promise<void> {
  const sheets = getSheetsClient();
  const { headers, rows } = await readSheet();
  const found = findRow(headers, rows, sku);
  if (!found) throw new Error(`Part with SKU "${sku}" was not found in the Google Sheet.`);
  const sheetId = await getSheetId();

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: env.googleSheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: found.rowNumber - 1, endIndex: found.rowNumber },
          },
        },
      ],
    },
  });
}

export async function setPhotographed(sku: string, value: boolean): Promise<void> {
  const sheets = getSheetsClient();
  const { headers, rows } = await readSheet();
  const found = findRow(headers, rows, sku);
  if (!found) return;
  const col = headers.indexOf('photographed');
  if (col === -1) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `${SHEET_NAME}!${colLetter(col)}${found.rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value ? 'TRUE' : 'FALSE']] },
  });
}

export async function createPart(data: CreatePartFields): Promise<string> {
  const sheets = getSheetsClient();
  const headers = await getHeaders();
  const record = buildCreateRecord(data, new Date().toISOString());

  await sheets.spreadsheets.values.append({
    spreadsheetId: env.googleSheetId,
    range: SHEET_NAME,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [recordToRow(headers, record)] },
  });

  return data.sku;
}

// Appends many new rows in a small, fixed number of API calls instead of one call per
// row — matters once an import gets into the hundreds/thousands of rows, since each
// row would otherwise cost a full-sheet read (readSheet is O(current row count)).
const APPEND_CHUNK_SIZE = 500;

export async function bulkCreateParts(items: CreatePartFields[]): Promise<void> {
  if (items.length === 0) return;
  const sheets = getSheetsClient();
  const headers = await getHeaders();
  const now = new Date().toISOString();
  const rows = items.map((data) => recordToRow(headers, buildCreateRecord(data, now)));

  for (let i = 0; i < rows.length; i += APPEND_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + APPEND_CHUNK_SIZE);
    await sheets.spreadsheets.values.append({
      spreadsheetId: env.googleSheetId,
      range: SHEET_NAME,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: chunk },
    });
  }
}

export async function updatePartFields(sku: string, data: Partial<CreatePartFields>): Promise<void> {
  const sheets = getSheetsClient();
  const { headers, rows } = await readSheet();
  const found = findRow(headers, rows, sku);
  if (!found) {
    await createPart({ sku, ...data });
    return;
  }

  const record: Partial<Record<FieldName, unknown>> = {};
  headers.forEach((h, i) => {
    if (KNOWN_FIELDS.includes(h as FieldName)) record[h as FieldName] = cellToString(found.row[i]);
  });

  (Object.keys(data) as (keyof CreatePartFields)[]).forEach((key) => {
    const value = data[key];
    if (value !== undefined) record[key as FieldName] = value;
  });
  record.updatedAt = new Date().toISOString();

  const lastCol = colLetter(headers.length - 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `${SHEET_NAME}!A${found.rowNumber}:${lastCol}${found.rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [recordToRow(headers, record)] },
  });
}
