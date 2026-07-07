import { deriveStatus } from '@warehouse/shared';
import type { InventoryPart, InventoryPartPatch, Photo } from '@warehouse/shared';
import { env } from '../config/env.js';
import { parseBoolean, parseDateOrNull, parseNumberOrNull } from '../lib/csv.js';
import { getSheetsClient } from './client.js';
import { listPhotosGroupedBySku } from './driveService.js';

const SHEET_NAME = 'Parts';

const KNOWN_FIELDS = [
  'sku',
  'description',
  'manufacturer',
  'inventorySite',
  'binLocation',
  'qoh',
  'confirmedQoh',
  'notes',
  'boxCondition',
  'photographed',
  'itemListed',
  'itemListedDate',
  'transferredToMarketRecovery',
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
  boxCondition?: string;
  notes?: string;
  itemListed?: boolean;
  itemListedDate?: string | null;
  transferredToMarketRecovery?: boolean;
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
    boxCondition: get('boxCondition'),
    photographed: parseBoolean(get('photographed')) || photos.length > 0,
    itemListed: parseBoolean(get('itemListed')),
    itemListedDate: parseDateOrNull(get('itemListedDate')),
    transferredToMarketRecovery: parseBoolean(get('transferredToMarketRecovery')),
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
    boxCondition: data.boxCondition,
    notes: data.notes,
    photographed: false,
    itemListed: data.itemListed ?? false,
    itemListedDate: data.itemListedDate,
    transferredToMarketRecovery: data.transferredToMarketRecovery ?? false,
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

export async function updatePart(sku: string, patch: InventoryPartPatch): Promise<InventoryPart> {
  const sheets = getSheetsClient();
  const { headers, rows } = await readSheet();
  const found = findRow(headers, rows, sku);
  if (!found) throw new Error(`Part with SKU "${sku}" was not found in the Google Sheet.`);

  const record: Partial<Record<FieldName, unknown>> = {};
  headers.forEach((h, i) => {
    if (KNOWN_FIELDS.includes(h as FieldName)) record[h as FieldName] = cellToString(found.row[i]);
  });

  if (patch.confirmedQoh !== undefined) record.confirmedQoh = patch.confirmedQoh;
  if (patch.notes !== undefined) record.notes = patch.notes;
  if (patch.boxCondition !== undefined) record.boxCondition = patch.boxCondition;
  if (patch.photographed !== undefined) record.photographed = patch.photographed;
  if (patch.itemListed !== undefined) record.itemListed = patch.itemListed;
  if (patch.itemListedDate !== undefined) record.itemListedDate = patch.itemListedDate;
  if (patch.transferredToMarketRecovery !== undefined) record.transferredToMarketRecovery = patch.transferredToMarketRecovery;
  if (patch.catalogingStartDate !== undefined) record.catalogingStartDate = patch.catalogingStartDate;
  record.updatedAt = new Date().toISOString();

  const lastCol = colLetter(headers.length - 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `${SHEET_NAME}!A${found.rowNumber}:${lastCol}${found.rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [recordToRow(headers, record)] },
  });

  return getPartBySku(sku);
}

export async function markPhotographed(sku: string): Promise<void> {
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
    requestBody: { values: [['TRUE']] },
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
