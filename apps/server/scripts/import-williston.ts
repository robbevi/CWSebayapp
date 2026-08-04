/**
 * One-time migration for the multi-site inventory load.
 *
 *   npx tsx scripts/import-williston.ts <file.xlsx>          # dry run, writes nothing
 *   npx tsx scripts/import-williston.ts <file.xlsx> --apply  # backs up, then writes
 *
 * Non-destructive by construction: it only ever updates descriptive/analytic columns on
 * rows it can match, appends rows it cannot, and never deletes. Every column that records
 * warehouse work (conditions, quantities, notes, photo/listing flags) is left untouched.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import xlsx from 'node-xlsx';
import { env } from '../src/config/env.js';
import { getSheetsClient } from '../src/google/client.js';

const SHEET_NAME = 'Parts';
const APPLY = process.argv.includes('--apply');
const FILE = process.argv[2];

// Columns the spreadsheet is authoritative for. Anything not listed here — every field a
// warehouse user can edit — is preserved exactly as it is on an existing row.
const REFRESHED = [
  'description',
  'manufacturer',
  'inventorySite',
  'binLocation',
  'qoh',
  'revenuePriorityRank',
  'fieldReviewPriority',
  'activeRecoveryPriceBasis',
  'expectedGrossRecoveryMargin',
  'grossMarginStatus',
] as const;

// The existing rows are all Williston, which the new file codes as NDPARTS.
const LEGACY_SITE = 'NDPARTS - WILLISTON PARTS';
const LEGACY_SITE_CODE = 'NDPARTS';

const U = (v: unknown) => (v == null ? '' : String(v).trim().toUpperCase());
const S = (v: unknown) => (v == null ? '' : String(v).trim());

// The source exports a few manufacturer names HTML-escaped ("DIXON VALVE &amp; COUPLING").
function decodeEntities(v: string): string {
  return v
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
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

const SOURCE_TO_FIELD: Record<string, string> = {
  sku: 'sku',
  description: 'description',
  manufacturer: 'manufacturer',
  inventorySite: 'inventorySite',
  binLocation: 'binLocation',
  qoh: 'qoh',
  'Revenue Priority Rank': 'revenuePriorityRank',
  'Field Review Priority': 'fieldReviewPriority',
  'Active Recovery Price Basis': 'activeRecoveryPriceBasis',
  'Expected Gross Recovery Margin': 'expectedGrossRecoveryMargin',
  'Gross Margin Status': 'grossMarginStatus',
};

async function main() {
  if (!FILE) throw new Error('Usage: import-williston.ts <file.xlsx> [--apply]');

  const [sheet] = xlsx.parse(readFileSync(FILE));
  const [srcHeader, ...srcRows] = sheet.data as unknown[][];
  const srcIdx = new Map(srcHeader.map((h, i) => [String(h), i]));

  const incoming = srcRows
    .filter((r) => r && r[0] != null && S(r[0]) !== '')
    .map((r) => {
      const rec: Record<string, string> = {};
      for (const [srcCol, field] of Object.entries(SOURCE_TO_FIELD)) {
        const i = srcIdx.get(srcCol);
        const raw = i == null ? '' : S(r[i]);
        rec[field] = field === 'manufacturer' ? decodeEntities(raw) : raw;
      }
      return rec;
    });

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.googleSheetId, range: SHEET_NAME });
  const values = res.data.values ?? [];
  const headers = [...(values[0] as string[])];
  const rows = values.slice(1);

  // partId is introduced by this migration itself, so add it to the header row if absent.
  const addingPartId = !headers.includes('partId');
  if (addingPartId) headers.push('partId');

  for (const required of ['sku', 'inventorySite', ...REFRESHED]) {
    if (!headers.includes(required)) throw new Error(`Sheet is missing required column "${required}".`);
  }
  const col = (name: string) => headers.indexOf(name);

  // Pass 1 — give every existing row a stable id and normalise the legacy site label.
  let idsAssigned = 0;
  let sitesNormalised = 0;
  const working = rows.map((r) => {
    const row = [...r];
    while (row.length < headers.length) row.push('');
    if (!S(row[col('partId')])) {
      row[col('partId')] = randomUUID();
      idsAssigned++;
    }
    if (U(row[col('inventorySite')]) === LEGACY_SITE) {
      row[col('inventorySite')] = LEGACY_SITE_CODE;
      sitesNormalised++;
    }
    return row;
  });

  const byKey = new Map<string, number>();
  working.forEach((row, i) => {
    if (S(row[col('sku')])) byKey.set(`${U(row[col('sku')])}|${U(row[col('inventorySite')])}`, i);
  });

  // Pass 2 — refresh matches, queue the rest as appends.
  let updated = 0;
  const appended: string[][] = [];
  for (const rec of incoming) {
    const key = `${U(rec.sku)}|${U(rec.inventorySite)}`;
    const at = byKey.get(key);
    if (at != null) {
      for (const field of REFRESHED) working[at][col(field)] = rec[field] ?? '';
      updated++;
    } else {
      const row = new Array(headers.length).fill('');
      row[col('partId')] = randomUUID();
      row[col('sku')] = rec.sku;
      for (const field of REFRESHED) row[col(field)] = rec[field] ?? '';
      if (col('photographed') !== -1) row[col('photographed')] = 'FALSE';
      if (col('itemListed') !== -1) row[col('itemListed')] = 'FALSE';
      if (col('transferredToMarketRecovery') !== -1) row[col('transferredToMarketRecovery')] = 'FALSE';
      if (col('updatedAt') !== -1) row[col('updatedAt')] = new Date().toISOString();
      appended.push(row);
      byKey.set(key, working.length + appended.length - 1);
    }
  }

  console.log('--- plan ---');
  console.log('source rows           :', incoming.length);
  console.log('adding partId column  :', addingPartId);
  console.log('partIds assigned      :', idsAssigned);
  console.log('sites normalised      :', sitesNormalised);
  console.log('existing rows updated :', updated);
  console.log('new rows appended     :', appended.length);
  console.log('rows deleted          : 0');
  console.log('final row count       :', working.length + appended.length, `(was ${rows.length})`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.');
    return;
  }

  // Snapshot the tab before touching it, so the whole migration is one click to undo.
  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.googleSheetId, fields: 'sheets.properties' });
  const sourceSheetId = meta.data.sheets?.find((s) => s.properties?.title === SHEET_NAME)?.properties?.sheetId;
  if (sourceSheetId == null) throw new Error('Could not resolve the Parts sheetId for the backup.');
  const backupTitle = `Parts Backup ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: env.googleSheetId,
    requestBody: { requests: [{ duplicateSheet: { sourceSheetId, newSheetName: backupTitle } }] },
  });
  console.log('\nbacked up to tab:', backupTitle);

  const lastCol = colLetter(headers.length - 1);
  if (addingPartId) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.googleSheetId,
      range: `${SHEET_NAME}!A1:${lastCol}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
    console.log('added partId header');
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `${SHEET_NAME}!A2:${lastCol}${working.length + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: working },
  });
  console.log('rewrote', working.length, 'existing rows');

  for (let i = 0; i < appended.length; i += 500) {
    const chunk = appended.slice(i, i + 500);
    await sheets.spreadsheets.values.append({
      spreadsheetId: env.googleSheetId,
      range: SHEET_NAME,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: chunk },
    });
    console.log('appended', Math.min(i + 500, appended.length), '/', appended.length);
  }
  console.log('done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
