/** Appends a header to the Parts sheet, refusing to write if the target range is occupied. */
import { env } from '../src/config/env.js';
import { getSheetsClient } from '../src/google/client.js';

const NAME = process.argv[2];

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
  if (!NAME) throw new Error('Usage: add-column.ts <headerName>');
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.googleSheetId, range: 'Parts' });
  const values = res.data.values ?? [];
  const headers = values[0] ?? [];
  if (headers.includes(NAME)) {
    console.log(`"${NAME}" already exists at column ${colLetter(headers.indexOf(NAME))}. Nothing to do.`);
    return;
  }
  const at = headers.length;
  const occupied = values.slice(1).filter((r) => r[at] !== undefined && r[at] !== '');
  if (occupied.length > 0) throw new Error(`${occupied.length} row(s) already hold data at column ${colLetter(at)}.`);

  // A sheet's grid has a fixed column count; writing past it fails rather than growing it.
  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.googleSheetId, fields: 'sheets.properties' });
  const props = meta.data.sheets?.find((s) => s.properties?.title === 'Parts')?.properties;
  const gridCols = props?.gridProperties?.columnCount ?? 0;
  if (props?.sheetId != null && at + 1 > gridCols) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.googleSheetId,
      requestBody: {
        requests: [{ appendDimension: { sheetId: props.sheetId, dimension: 'COLUMNS', length: at + 1 - gridCols } }],
      },
    });
    console.log(`Grew grid from ${gridCols} to ${at + 1} columns.`);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `Parts!${colLetter(at)}1`,
    valueInputOption: 'RAW',
    requestBody: { values: [[NAME]] },
  });
  console.log(`Added "${NAME}" at column ${colLetter(at)}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
