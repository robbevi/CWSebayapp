import { randomUUID } from 'node:crypto';
import { deriveStatus, getDiscrepancy, isWinForRole, roleForUser } from '@warehouse/shared';
import type {
  DiscrepancyLogEntry,
  InventoryPart,
  InventoryPartPatch,
  Photo,
  Sale,
  Submission,
} from '@warehouse/shared';
import { env } from '../config/env.js';
import { parseBoolean, parseDateOrNull, parseNumberOrNull } from '../lib/csv.js';
import { getSheetsClient } from './client.js';
import { listPhotosGrouped, type GroupedPhotos } from './driveService.js';

const SHEET_NAME = 'Parts';
const SUBMISSIONS_SHEET = 'Submissions';
const SUBMISSIONS_HEADERS = ['sku', 'user', 'role', 'completedAt'];
const SALES_SHEET = 'Sales';
const SALES_HEADERS = [
  'lineItemId',
  'orderId',
  'soldAt',
  'ebayListingId',
  'sku',
  'qtySold',
  'grossSale',
  'shipping',
  'tax',
  'fees',
  'netProceeds',
  'currency',
  'feesEstimated',
  'syncedAt',
];
const DISCREPANCIES_SHEET = 'Discrepancies';
const DISCREPANCIES_HEADERS = [
  'sku',
  'inventorySite',
  'binLocation',
  'expectedQoh',
  'countedQoh',
  'variance',
  'kind',
  'user',
  'recordedAt',
];

const KNOWN_FIELDS = [
  'partId',
  'sku',
  'description',
  'manufacturer',
  'inventorySite',
  'binLocation',
  'newBinLocation',
  'qoh',
  'confirmedQoh',
  'notes',
  'itemCondition',
  'boxCondition',
  'disposition',
  'dispositionNote',
  'photographed',
  'needsReview',
  'needsReviewNote',
  'itemListed',
  'itemListedDate',
  'ebayListingId',
  'transferredToMarketRecovery',
  'transferId',
  'catalogingStartDate',
  'legacyPartId',
  'importSequenceNumber',
  'createdAt',
  'revenuePriorityRank',
  'fieldReviewPriority',
  'activeRecoveryPriceBasis',
  'expectedGrossRecoveryMargin',
  'grossMarginStatus',
  'updatedAt',
] as const;
type FieldName = (typeof KNOWN_FIELDS)[number];

export interface CreatePartFields {
  partId?: string;
  sku: string;
  description?: string;
  manufacturer?: string;
  inventorySite?: string;
  binLocation?: string;
  newBinLocation?: string;
  qoh?: number;
  confirmedQoh?: number | null;
  itemCondition?: string;
  boxCondition?: string;
  disposition?: string;
  dispositionNote?: string;
  notes?: string;
  needsReview?: boolean;
  needsReviewNote?: string;
  itemListed?: boolean;
  itemListedDate?: string | null;
  ebayListingId?: string | null;
  transferredToMarketRecovery?: boolean;
  transferId?: string | null;
  catalogingStartDate?: string | null;
  legacyPartId?: string;
  importSequenceNumber?: number | null;
  createdAt?: string;
  revenuePriorityRank?: number | null;
  fieldReviewPriority?: string;
  activeRecoveryPriceBasis?: number | null;
  expectedGrossRecoveryMargin?: number | null;
  grossMarginStatus?: string;
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
    // partId is the stable record key: the same SKU can be stocked at several sites, and a
    // site can be renamed, so neither SKU nor SKU+site is a safe identity. Rows written
    // before this column existed fall back to the SKU so nothing 404s mid-migration.
    id: get('partId') ?? sku,
    sku,
    description: get('description') ?? '',
    manufacturer: get('manufacturer') ?? '',
    inventorySite: get('inventorySite') ?? '',
    binLocation: get('binLocation') ?? '',
    newBinLocation: get('newBinLocation'),
    qoh: parseNumberOrNull(get('qoh')) ?? 0,
    confirmedQoh: parseNumberOrNull(get('confirmedQoh')),
    notes: get('notes'),
    itemCondition: get('itemCondition'),
    boxCondition: get('boxCondition'),
    disposition: get('disposition'),
    dispositionNote: get('dispositionNote'),
    photographed: parseBoolean(get('photographed')) || photos.length > 0,
    needsReview: parseBoolean(get('needsReview')),
    needsReviewNote: get('needsReviewNote'),
    itemListed: parseBoolean(get('itemListed')),
    itemListedDate: parseDateOrNull(get('itemListedDate')),
    ebayListingId: get('ebayListingId') ?? null,
    transferredToMarketRecovery: parseBoolean(get('transferredToMarketRecovery')),
    transferId: get('transferId') ?? null,
    catalogingStartDate: parseDateOrNull(get('catalogingStartDate')),
    legacyPartId: get('legacyPartId'),
    importSequenceNumber: parseNumberOrNull(get('importSequenceNumber')),
    createdAt: get('createdAt'),
    revenuePriorityRank: parseNumberOrNull(get('revenuePriorityRank')),
    fieldReviewPriority: get('fieldReviewPriority'),
    activeRecoveryPriceBasis: parseNumberOrNull(get('activeRecoveryPriceBasis')),
    expectedGrossRecoveryMargin: parseNumberOrNull(get('expectedGrossRecoveryMargin')),
    grossMarginStatus: get('grossMarginStatus'),
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
    partId: data.partId ?? randomUUID(),
    sku: data.sku,
    description: data.description,
    manufacturer: data.manufacturer,
    inventorySite: data.inventorySite,
    binLocation: data.binLocation,
    newBinLocation: data.newBinLocation,
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
    // Stamped here rather than passed in, so every row created through the app is dated
    // even when the caller doesn't think to supply one.
    createdAt: data.createdAt ?? updatedAt,
    revenuePriorityRank: data.revenuePriorityRank,
    fieldReviewPriority: data.fieldReviewPriority,
    activeRecoveryPriceBasis: data.activeRecoveryPriceBasis,
    expectedGrossRecoveryMargin: data.expectedGrossRecoveryMargin,
    grossMarginStatus: data.grossMarginStatus,
    updatedAt,
  };
}

// `id` is a partId for rows written since the multi-site migration, and a bare SKU for
// anything older (or for callers that only know the SKU, like the photo routes). Match on
// partId first so the right row wins when a SKU is stocked at more than one site.
function findRow(headers: string[], rows: unknown[][], id: string): { rowNumber: number; row: unknown[] } | undefined {
  const needle = id.trim().toUpperCase();
  const partIdCol = headers.indexOf('partId');
  if (partIdCol !== -1) {
    const index = rows.findIndex((r) => cellToString(r[partIdCol])?.trim().toUpperCase() === needle);
    if (index !== -1) return { rowNumber: index + 2, row: rows[index] };
  }
  const skuCol = headers.indexOf('sku');
  if (skuCol === -1) return undefined;
  const index = rows.findIndex((r) => cellToString(r[skuCol])?.trim().toUpperCase() === needle);
  if (index === -1) return undefined;
  return { rowNumber: index + 2, row: rows[index] };
}

// Legacy (pre-partId) photos only carry a SKU, so they cannot say *which* row of a
// multi-site SKU they belong to. Attach them to the first row for that SKU — for the
// existing data that is always the original Williston row the photo was taken against.
function photosFor(part: InventoryPart, grouped: GroupedPhotos, claimedLegacySkus: Set<string>): Photo[] {
  const own = grouped.byPartId.get(part.id) ?? [];
  const skuKey = part.sku.toUpperCase();
  const legacy = grouped.legacyBySku.get(skuKey);
  if (!legacy || claimedLegacySkus.has(skuKey)) return own;
  claimedLegacySkus.add(skuKey);
  return [...own, ...legacy];
}

export async function getAllParts(): Promise<InventoryPart[]> {
  const { headers, rows } = await readSheet();
  const grouped = await listPhotosGrouped();
  const claimed = new Set<string>();
  return rows
    .filter((row) => row.some((cell) => cellToString(cell) !== undefined))
    .map((row) => {
      const bare = mapRowToPart(headers, row, []);
      return { ...bare, photos: photosFor(bare, grouped, claimed) };
    })
    .map((p) => ({ ...p, photographed: p.photographed || p.photos.length > 0 }));
}

export async function getPartById(id: string): Promise<InventoryPart> {
  const { headers, rows } = await readSheet();
  const found = findRow(headers, rows, id);
  if (!found) throw new Error(`Part "${id}" was not found in the Google Sheet.`);
  const grouped = await listPhotosGrouped();
  const bare = mapRowToPart(headers, found.row, []);
  const photos = [...(grouped.byPartId.get(bare.id) ?? []), ...(grouped.legacyBySku.get(bare.sku.toUpperCase()) ?? [])];
  return { ...bare, photos, photographed: bare.photographed || photos.length > 0 };
}

const readyLogSheets = new Set<string>();

// Creates a log tab (with its header row) the first time it's needed, so tracking works
// without anyone having to manually prep the spreadsheet first.
async function ensureLogSheet(title: string, headers: string[]): Promise<void> {
  if (readyLogSheets.has(title)) return;
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId: env.googleSheetId, fields: 'sheets.properties' });
  const exists = res.data.sheets?.some((s) => s.properties?.title === title);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.googleSheetId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.googleSheetId,
      range: `${title}!A1:${colLetter(headers.length - 1)}1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headers] },
    });
  }
  readyLogSheets.add(title);
}

async function ensureSubmissionsSheet(): Promise<void> {
  await ensureLogSheet(SUBMISSIONS_SHEET, SUBMISSIONS_HEADERS);
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

export async function getDiscrepancyLog(): Promise<DiscrepancyLogEntry[]> {
  await ensureLogSheet(DISCREPANCIES_SHEET, DISCREPANCIES_HEADERS);
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.googleSheetId, range: DISCREPANCIES_SHEET });
  const [, ...rows] = res.data.values ?? [];
  return rows
    .filter((row) => row.length > 0 && row[0])
    .map((row) => ({
      sku: String(row[0] ?? ''),
      inventorySite: String(row[1] ?? ''),
      binLocation: String(row[2] ?? ''),
      expectedQoh: Number(row[3] ?? 0),
      countedQoh: Number(row[4] ?? 0),
      variance: Number(row[5] ?? 0),
      kind: String(row[6] ?? '') as DiscrepancyLogEntry['kind'],
      user: String(row[7] ?? ''),
      recordedAt: String(row[8] ?? ''),
    }));
}

// Recorded as a point-in-time row rather than derived on the fly, because the expected
// quantity is refreshed from the source spreadsheet on every import — a variance computed
// later against a changed qoh would silently misstate what the counter actually found.
function discrepancyToRow(e: DiscrepancyLogEntry): (string | number)[] {
  return [
    e.sku,
    e.inventorySite,
    e.binLocation,
    e.expectedQoh,
    e.countedQoh,
    e.variance,
    e.kind,
    e.user,
    e.recordedAt,
  ];
}

export async function appendDiscrepancies(entries: DiscrepancyLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await ensureLogSheet(DISCREPANCIES_SHEET, DISCREPANCIES_HEADERS);
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: env.googleSheetId,
    range: DISCREPANCIES_SHEET,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: entries.map(discrepancyToRow) },
  });
}

async function appendDiscrepancy(entry: DiscrepancyLogEntry): Promise<void> {
  await appendDiscrepancies([entry]);
}

// Only fires when the counted quantity actually changes, so re-saving a part that already
// has a logged variance doesn't pile up duplicate rows.
async function logDiscrepancyIfChanged(
  before: InventoryPart,
  after: InventoryPart,
  submittedBy: string | undefined
): Promise<void> {
  if (before.confirmedQoh === after.confirmedQoh) return;
  const d = getDiscrepancy(after);
  if (!d || d.kind === 'none') return;
  await appendDiscrepancy({
    sku: after.sku,
    inventorySite: after.inventorySite,
    binLocation: after.binLocation,
    expectedQoh: after.qoh,
    countedQoh: after.confirmedQoh as number,
    variance: d.variance,
    kind: d.kind,
    user: submittedBy ?? 'unknown',
    recordedAt: new Date().toISOString(),
  });
}

// A "win" can be completed by either of two independent code paths — saving the detail
// form (updatePart) or uploading the photo that satisfies the last missing checkpoint
// (setPhotographed) — so both call this rather than only the save path. Logging only on
// save silently lost every completion where the photo was taken last.
async function logWinIfCompleted(
  sku: string,
  before: InventoryPart,
  after: InventoryPart,
  submittedBy: string | undefined
): Promise<void> {
  if (!submittedBy) return;
  const role = roleForUser(env.appUsers, submittedBy);
  if (!role) return;
  if (isWinForRole(role, before) || !isWinForRole(role, after)) return;
  await appendSubmission({ sku, user: submittedBy, role, completedAt: new Date().toISOString() });
}

export async function updatePart(id: string, patch: InventoryPartPatch, submittedBy?: string): Promise<InventoryPart> {
  const sheets = getSheetsClient();
  const { headers, rows } = await readSheet();
  const found = findRow(headers, rows, id);
  if (!found) throw new Error(`Part "${id}" was not found in the Google Sheet.`);
  const before = mapRowToPart(headers, found.row, []);

  const record: Partial<Record<FieldName, unknown>> = {};
  headers.forEach((h, i) => {
    if (KNOWN_FIELDS.includes(h as FieldName)) record[h as FieldName] = cellToString(found.row[i]);
  });

  // Header fields are editable from Part Detail. SKU is not in the patch type, so a row's
  // identity — and the Drive photos keyed to it — can't be changed out from under it here.
  if (patch.description !== undefined) record.description = patch.description;
  if (patch.manufacturer !== undefined) record.manufacturer = patch.manufacturer;
  if (patch.inventorySite !== undefined) record.inventorySite = patch.inventorySite;
  if (patch.binLocation !== undefined) record.binLocation = patch.binLocation;
  if (patch.qoh !== undefined) record.qoh = patch.qoh;
  if (patch.needsReview !== undefined) record.needsReview = patch.needsReview;
  if (patch.needsReviewNote !== undefined) record.needsReviewNote = patch.needsReviewNote;
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
  if (patch.newBinLocation !== undefined) record.newBinLocation = patch.newBinLocation;
  record.updatedAt = new Date().toISOString();

  const lastCol = colLetter(headers.length - 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `${SHEET_NAME}!A${found.rowNumber}:${lastCol}${found.rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [recordToRow(headers, record)] },
  });

  const after = mapRowToPart(headers, recordToRow(headers, record), []);
  await logWinIfCompleted(before.sku, before, after, submittedBy);
  await logDiscrepancyIfChanged(before, after, submittedBy);

  return getPartById(id);
}

export async function deletePart(id: string): Promise<void> {
  const sheets = getSheetsClient();
  const { headers, rows } = await readSheet();
  const found = findRow(headers, rows, id);
  if (!found) throw new Error(`Part "${id}" was not found in the Google Sheet.`);
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

export async function setPhotographed(id: string, value: boolean, submittedBy?: string): Promise<void> {
  const sheets = getSheetsClient();
  const { headers, rows } = await readSheet();
  const found = findRow(headers, rows, id);
  if (!found) return;
  const col = headers.indexOf('photographed');
  if (col === -1) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `${SHEET_NAME}!${colLetter(col)}${found.rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value ? 'TRUE' : 'FALSE']] },
  });

  const before = mapRowToPart(headers, found.row, []);
  const afterRow = [...found.row];
  afterRow[col] = value ? 'TRUE' : 'FALSE';
  await logWinIfCompleted(before.sku, before, mapRowToPart(headers, afterRow, []), submittedBy);
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

  return String(record.partId);
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


async function ensureSalesSheet(): Promise<void> {
  await ensureLogSheet(SALES_SHEET, SALES_HEADERS);
}

export async function getSales(): Promise<Sale[]> {
  await ensureSalesSheet();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.googleSheetId, range: SALES_SHEET });
  const [, ...rows] = res.data.values ?? [];
  return rows
    .filter((row) => row.length > 0 && row[0])
    .map((row) => ({
      lineItemId: String(row[0] ?? ''),
      orderId: String(row[1] ?? ''),
      soldAt: String(row[2] ?? ''),
      ebayListingId: String(row[3] ?? ''),
      sku: String(row[4] ?? ''),
      qtySold: Number(row[5] ?? 0),
      grossSale: Number(row[6] ?? 0),
      shipping: Number(row[7] ?? 0),
      tax: Number(row[8] ?? 0),
      fees: Number(row[9] ?? 0),
      netProceeds: Number(row[10] ?? 0),
      currency: String(row[11] ?? 'USD'),
      feesEstimated: parseBoolean(String(row[12] ?? '')),
      syncedAt: String(row[13] ?? ''),
    }));
}

function saleToRow(sale: Sale): unknown[] {
  return [
    sale.lineItemId,
    sale.orderId,
    sale.soldAt,
    sale.ebayListingId,
    sale.sku,
    sale.qtySold,
    sale.grossSale,
    sale.shipping,
    sale.tax,
    sale.fees,
    sale.netProceeds,
    sale.currency,
    sale.feesEstimated,
    sale.syncedAt,
  ];
}

export interface SaleWriteResult {
  added: number;
  updated: number;
  unchanged: number;
}

/**
 * Writes synced sales, keyed on eBay's line item id.
 *
 * A sync always overlaps the previous one, so the same sale arrives repeatedly — it must
 * land once. Existing rows are rewritten in place rather than appended, which also lets an
 * estimated fee be replaced by the real one once eBay posts the finance record.
 */
export async function upsertSales(sales: Sale[]): Promise<SaleWriteResult> {
  if (sales.length === 0) return { added: 0, updated: 0, unchanged: 0 };
  await ensureSalesSheet();
  const sheets = getSheetsClient();
  const existing = await getSales();
  const rowByLineItem = new Map<string, number>();
  existing.forEach((s, i) => rowByLineItem.set(s.lineItemId, i + 2));
  const currentByLineItem = new Map(existing.map((s) => [s.lineItemId, s]));

  const updates: { range: string; values: unknown[][] }[] = [];
  const appends: unknown[][] = [];
  let unchanged = 0;
  const lastCol = colLetter(SALES_HEADERS.length - 1);

  for (const sale of sales) {
    const rowNumber = rowByLineItem.get(sale.lineItemId);
    if (rowNumber === undefined) {
      appends.push(saleToRow(sale));
      continue;
    }
    const current = currentByLineItem.get(sale.lineItemId)!;
    // syncedAt always differs, so compare the parts that carry meaning.
    const same =
      current.qtySold === sale.qtySold &&
      current.grossSale === sale.grossSale &&
      current.fees === sale.fees &&
      current.netProceeds === sale.netProceeds &&
      current.feesEstimated === sale.feesEstimated;
    if (same) {
      unchanged++;
      continue;
    }
    updates.push({ range: `${SALES_SHEET}!A${rowNumber}:${lastCol}${rowNumber}`, values: [saleToRow(sale)] });
  }

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: env.googleSheetId,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    });
  }
  if (appends.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: env.googleSheetId,
      range: SALES_SHEET,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: appends },
    });
  }

  return { added: appends.length, updated: updates.length, unchanged };
}
