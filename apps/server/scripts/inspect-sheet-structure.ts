/**
 * Read-only. Shows where each column sits, any filter ranges (a sort confined to a filter
 * range that stops short of partId would scramble ids), and the sheet's revision history.
 *
 *   npx tsx scripts/inspect-sheet-structure.ts
 */
import { env } from '../src/config/env.js';
import { getDriveUploadClient, getSheetsClient } from '../src/google/client.js';

const letter = (i: number): string => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const rangeText = (r: any) =>
  r ? `${letter(r.startColumnIndex ?? 0)}${(r.startRowIndex ?? 0) + 1}:${r.endColumnIndex != null ? letter(r.endColumnIndex - 1) : '∞'}${r.endRowIndex ?? '∞'}` : '(none)';

const sheets = getSheetsClient();
const meta = await sheets.spreadsheets.get({
  spreadsheetId: env.googleSheetId,
  fields: 'sheets(properties(title,sheetId,gridProperties),basicFilter(range,sortSpecs),filterViews(title,range,sortSpecs),protectedRanges(range,description))',
});
for (const sh of meta.data.sheets ?? []) {
  const p = sh.properties!;
  console.log(`\nTab "${p.title}"  rows ${p.gridProperties?.rowCount}  cols ${p.gridProperties?.columnCount}`);
  if (sh.basicFilter) console.log(`  basic filter: ${rangeText(sh.basicFilter.range)}  sort: ${JSON.stringify(sh.basicFilter.sortSpecs ?? [])}`);
  for (const fv of sh.filterViews ?? []) console.log(`  filter view "${fv.title}": ${rangeText(fv.range)}  sort: ${JSON.stringify(fv.sortSpecs ?? [])}`);
}

const firstTab = meta.data.sheets?.[0]?.properties?.title;
const header = await sheets.spreadsheets.values.get({ spreadsheetId: env.googleSheetId, range: `${firstTab}!1:1` });
console.log(`\nHeader row of "${firstTab}":`);
(header.data.values?.[0] ?? []).forEach((h, i) => console.log(`  ${letter(i).padEnd(3)} ${h}`));

try {
  const drive = getDriveUploadClient();
  const revs = await drive.revisions.list({
    fileId: env.googleSheetId!,
    fields: 'revisions(id,modifiedTime,lastModifyingUser(displayName),exportLinks)',
    pageSize: 200,
  });
  const list = revs.data.revisions ?? [];
  console.log(`\nRevisions visible: ${list.length}`);
  for (const r of list.slice(-40)) {
    console.log(`  ${r.id?.padEnd(8)} ${r.modifiedTime}  ${r.lastModifyingUser?.displayName ?? '?'}  export:${r.exportLinks ? Object.keys(r.exportLinks).length : 0}`);
  }
} catch (e) {
  console.log(`\nRevisions unavailable: ${(e as Error).message}`);
}
console.log('');
