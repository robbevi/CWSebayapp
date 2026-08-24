/**
 * Removes rows from the Sales tab by eBay listing id or line item id.
 *
 *   npx tsx scripts/remove-sale.ts <id> [<id>...]           dry run
 *   npx tsx scripts/remove-sale.ts <id> [<id>...] --apply   deletes
 *
 * Needed when a sale lands that isn't Calfrac's — a sync run against the wrong eBay
 * account, say. A correct sync won't remove it on its own, because a sale it cannot see is
 * a sale it leaves alone.
 *
 * Rows are deleted bottom-up so earlier deletions don't shift the indexes of later ones.
 */
import { env } from '../src/config/env.js';
import { getSheetsClient } from '../src/google/client.js';

const SHEET = 'Sales';
const apply = process.argv.includes('--apply');
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));

if (ids.length === 0) {
  console.error('\nUsage: npx tsx scripts/remove-sale.ts <listingId|lineItemId> [...] [--apply]\n');
  process.exit(1);
}

const sheets = getSheetsClient();

const meta = await sheets.spreadsheets.get({ spreadsheetId: env.googleSheetId, fields: 'sheets.properties' });
const sheetId = meta.data.sheets?.find((s) => s.properties?.title === SHEET)?.properties?.sheetId;
if (sheetId == null) {
  console.error(`\nNo "${SHEET}" tab on the spreadsheet.\n`);
  process.exit(1);
}

const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.googleSheetId, range: SHEET });
const values = res.data.values ?? [];
const headers = (values[0] ?? []) as string[];
const col = (name: string) => headers.indexOf(name);

const lineItemCol = col('lineItemId');
const listingCol = col('ebayListingId');
const soldAtCol = col('soldAt');
const grossCol = col('grossSale');

const wanted = new Set(ids);
const matches: { rowNumber: number; label: string }[] = [];

values.slice(1).forEach((row, i) => {
  const lineItemId = String(row[lineItemCol] ?? '');
  const listingId = String(row[listingCol] ?? '');
  if (!wanted.has(lineItemId) && !wanted.has(listingId)) return;
  matches.push({
    rowNumber: i + 2,
    label: `${String(row[soldAtCol] ?? '').slice(0, 10)}  listing ${listingId}  gross ${row[grossCol] ?? ''}`,
  });
});

console.log(`\nSales rows: ${values.length - 1}`);
console.log(`Matching the id(s) given: ${matches.length}\n`);
for (const m of matches) console.log(`  row ${m.rowNumber}   ${m.label}`);

if (matches.length === 0) {
  console.log('\nNothing to remove.\n');
  process.exit(0);
}

if (!apply) {
  console.log('\nDry run. Re-run with --apply to delete these rows.\n');
  process.exit(0);
}

// Bottom-up, so deleting one row doesn't renumber the rest.
const ordered = [...matches].sort((a, b) => b.rowNumber - a.rowNumber);
await sheets.spreadsheets.batchUpdate({
  spreadsheetId: env.googleSheetId,
  requestBody: {
    requests: ordered.map((m) => ({
      deleteDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: m.rowNumber - 1, endIndex: m.rowNumber },
      },
    })),
  },
});

console.log(`\nDeleted ${ordered.length} row(s).\n`);
