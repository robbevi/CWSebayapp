/** Prints the tabs on the Parts spreadsheet. Handy when verifying a log sheet was created. */
import { env } from '../src/config/env.js';
import { getSheetsClient } from '../src/google/client.js';

async function main() {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.googleSheetId, fields: 'sheets.properties' });
  console.log('TABS:', meta.data.sheets?.map((s) => s.properties?.title).join(' | '));
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.googleSheetId, range: 'Sales!1:1' });
  console.log('SALES HEADERS:', (res.data.values?.[0] ?? []).join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
