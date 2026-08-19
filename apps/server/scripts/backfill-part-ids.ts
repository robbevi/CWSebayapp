/**
 * Assigns a partId to any Parts row that lacks one.
 *
 * Rows without a partId fall back to their SKU as an identity, and findRow() resolves a
 * SKU to the *first* matching row — so a write aimed at one of these rows can land on a
 * different row of the same SKU. Backfilling closes that hole.
 *
 * Dry run by default; pass --apply to write.
 */
import { randomUUID } from 'node:crypto';
import { env } from '../src/config/env.js';
import { getSheetsClient } from '../src/google/client.js';

const APPLY = process.argv.includes('--apply');
const SHEET = 'Parts';

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

async function main() {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.googleSheetId, range: SHEET });
  const values = res.data.values ?? [];
  const headers = (values[0] ?? []) as string[];

  const idCol = headers.indexOf('partId');
  const skuCol = headers.indexOf('sku');
  if (idCol === -1) throw new Error('No partId column on the Parts sheet.');

  const missing: { rowNumber: number; sku: string }[] = [];
  const seen = new Set<string>();
  values.slice(1).forEach((row, i) => {
    const id = (row[idCol] ?? '').toString().trim();
    if (id) {
      seen.add(id);
      return;
    }
    // Skip fully blank trailing rows so we don't mint ids for empty grid space.
    if (row.every((c) => (c ?? '').toString().trim() === '')) return;
    missing.push({ rowNumber: i + 2, sku: (row[skuCol] ?? '').toString() });
  });

  console.log(`Rows: ${values.length - 1}`);
  console.log(`With a partId: ${seen.size}`);
  console.log(`Missing a partId: ${missing.length}`);
  if (missing.length === 0) return;
  console.log('Examples:', missing.slice(0, 5).map((m) => `row ${m.rowNumber} (${m.sku})`).join(', '));

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write these ids.');
    return;
  }

  const letter = colLetter(idCol);
  const data = missing.map((m) => ({ range: `${SHEET}!${letter}${m.rowNumber}`, values: [[randomUUID()]] }));
  // Only the partId cell of each affected row is touched; every other column is untouched.
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: env.googleSheetId,
    requestBody: { valueInputOption: 'RAW', data },
  });
  console.log(`Wrote ${data.length} partId values.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
