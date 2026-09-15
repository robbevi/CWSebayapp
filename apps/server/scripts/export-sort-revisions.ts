/**
 * Read-only. Prints every tab's header row, then exports the Parts tab as it stood just
 * before and just after the 09-08 sort, so the original partId-to-row pairing can be
 * recovered by comparison.
 *
 *   npx tsx scripts/export-sort-revisions.ts <outDir> [revisionId...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../src/config/env.js';
import { getDriveUploadClient, getSheetsClient } from '../src/google/client.js';

const outDir = process.argv[2];
const revisionIds = process.argv.slice(3).length ? process.argv.slice(3) : ['2893', '2905'];
if (!outDir) throw new Error('Pass an output directory.');
fs.mkdirSync(outDir, { recursive: true });

const letter = (i: number): string => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const spreadsheetId = env.googleSheetId!;
const sheets = getSheetsClient();
const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(title,sheetId))' });
const tabs = (meta.data.sheets ?? []).map((s) => s.properties!);

for (const t of tabs) {
  const h = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${t.title}'!1:1` });
  const cols = h.data.values?.[0] ?? [];
  console.log(`\n"${t.title}" (sheetId ${t.sheetId}) — ${cols.length} headers`);
  console.log('  ' + cols.map((c, i) => `${letter(i)}=${c}`).join('  '));
}

const partsTab = tabs.find((t) => t.title === 'Parts');
if (!partsTab) throw new Error('No Parts tab.');

const drive = getDriveUploadClient();
const auth = (drive as unknown as { context: { _options: { auth: { request: (o: object) => Promise<{ data: string }> } } } }).context._options.auth;

for (const revisionId of revisionIds) {
  const rev = await drive.revisions.get({ fileId: spreadsheetId, revisionId, fields: 'id,modifiedTime,lastModifyingUser(displayName),exportLinks' });
  const links = rev.data.exportLinks ?? {};
  const csv = links['text/csv'];
  console.log(`\nRevision ${revisionId}  ${rev.data.modifiedTime}  ${rev.data.lastModifyingUser?.displayName}`);
  if (!csv) {
    console.log(`  no CSV export link; formats: ${Object.keys(links).join(', ')}`);
    continue;
  }
  const url = `${csv}&gid=${partsTab.sheetId}`;
  const res = await auth.request({ url, responseType: 'text' });
  const file = path.join(outDir, `parts-rev-${revisionId}.csv`);
  fs.writeFileSync(file, res.data);
  const lines = res.data.split('\n');
  console.log(`  saved ${file}`);
  console.log(`  ${lines.length} lines; header: ${lines[0].slice(0, 400)}`);
}
console.log('');
