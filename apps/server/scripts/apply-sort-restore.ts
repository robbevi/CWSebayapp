/**
 * Applies restore-plan.json from plan-sort-restore.ts. CHECK-ONLY unless --apply.
 *
 *   npx tsx scripts/apply-sort-restore.ts <dir>                      checks the plan is still current
 *   npx tsx scripts/apply-sort-restore.ts <dir> --apply              writes it
 *   npx tsx scripts/apply-sort-restore.ts <dir> --apply --fix-filter also widens the Parts filter
 *
 * People keep working while this runs, so every planned row is re-checked against the live
 * sheet first and nothing is written if any of them has moved or changed since planning.
 * Only W–AC is written — the planner found nothing to change in AD–AH, so those cells are
 * never touched. The sheet goes in one batch so the window for a concurrent save to land
 * mid-repair is as small as it can be, and the result is read back and verified.
 */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../src/config/env.js';
import { getDriveUploadClient, getSheetsClient } from '../src/google/client.js';

const dir = process.argv[2];
if (!dir) throw new Error('Pass the directory holding restore-plan.json.');
const apply = process.argv.includes('--apply');
const fixFilter = process.argv.includes('--fix-filter');

const W = 22;
const END = 34;
const WRITE_COLS = 7; // W through AC
const MAX_PLAN_AGE_MS = 30 * 60 * 1000;

interface Write {
  row: number;
  sku: string;
  from: string[];
  to: string[];
}
interface Plan {
  generatedAt: string;
  writes: Write[];
  restamps: { fileId: string; name: string; from: string; to: string }[];
}

const plan = JSON.parse(fs.readFileSync(path.join(dir, 'restore-plan.json'), 'utf8')) as Plan;
const ageMs = Date.now() - Date.parse(plan.generatedAt);
console.log(`\nPlan from ${plan.generatedAt} (${Math.round(ageMs / 60000)} min old): ${plan.writes.length} rows, ${plan.restamps.length} photo re-stamps`);
if (apply && ageMs > MAX_PLAN_AGE_MS) {
  console.log('Plan is over 30 minutes old — re-run plan-sort-restore.ts first. Nothing written.\n');
  process.exit(1);
}

const pad = (r: unknown[]): string[] => {
  const x = r.slice(0, END).map((v) => (v == null ? '' : String(v)));
  while (x.length < END) x.push('');
  return x;
};
const norm = (v: string, c: number) => {
  const t = v.trim();
  if (c === 29) return t.toUpperCase() === 'TRUE' ? 'TRUE' : '';
  return t;
};

const spreadsheetId = env.googleSheetId!;
const sheets = getSheetsClient();
const readLive = async () =>
  ((await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Parts!A1:AH' })).data.values ?? []).map(pad);

const live = await readLive();
const backup = path.join(dir, `parts-pre-apply-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(backup, JSON.stringify(live));
console.log(`Live Parts tab backed up to ${backup}`);

const stale: string[] = [];
for (const w of plan.writes) {
  const row = live[w.row - 1];
  if (!row) {
    stale.push(`row ${w.row} ${w.sku}: row no longer exists`);
    continue;
  }
  if (row[0] !== w.sku) {
    stale.push(`row ${w.row}: expected ${w.sku}, found ${row[0]}`);
    continue;
  }
  for (let i = 0; i < END - W; i++) {
    if (norm(row[W + i], W + i) !== norm(w.from[i], W + i)) {
      stale.push(`row ${w.row} ${w.sku} col ${W + i}: planned from "${w.from[i]}", now "${row[W + i]}"`);
      break;
    }
  }
}
console.log(`Freshness check: ${plan.writes.length - stale.length} current, ${stale.length} changed since planning`);
if (stale.length) {
  for (const s of stale.slice(0, 15)) console.log(`  ${s}`);
  console.log('Nothing written. Re-run plan-sort-restore.ts and try again.\n');
  process.exit(1);
}
if (!apply) {
  console.log('Check passed. Nothing written — re-run with --apply to write it.\n');
  process.exit(0);
}

// 1. Sheet, in one batch.
await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId,
  requestBody: {
    valueInputOption: 'USER_ENTERED',
    data: plan.writes.map((w) => ({ range: `Parts!W${w.row}:AC${w.row}`, values: [w.to.slice(0, WRITE_COLS)] })),
  },
});
const after = await readLive();
let verified = 0;
const mismatched: string[] = [];
for (const w of plan.writes) {
  const row = after[w.row - 1];
  const ok = row && w.to.slice(0, WRITE_COLS).every((v, i) => norm(row[W + i], W + i) === norm(v, W + i));
  if (ok) verified++;
  else mismatched.push(`row ${w.row} ${w.sku}`);
}
console.log(`\nSheet: wrote ${plan.writes.length} rows; read back ${verified} as planned, ${mismatched.length} not`);
for (const m of mismatched.slice(0, 10)) console.log(`  ${m}`);

// 2. Photos taken after the sort, stamped with the partId their row had then.
const drive = getDriveUploadClient();
let restamped = 0;
let skipped = 0;
for (const r of plan.restamps) {
  const f = await drive.files.get({ fileId: r.fileId, fields: 'properties' });
  if (f.data.properties?.partId !== r.from) {
    skipped++;
    continue;
  }
  await drive.files.update({ fileId: r.fileId, requestBody: { properties: { partId: r.to } } });
  restamped++;
}
console.log(`Photos: re-stamped ${restamped}, skipped ${skipped} (partId had already changed)`);

// 3. Optionally widen the filter, so a future sort moves whole rows.
if (fixFilter) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title,gridProperties),basicFilter)',
  });
  const tab = meta.data.sheets?.find((s) => s.properties?.title === 'Parts');
  if (!tab?.basicFilter) {
    console.log('Filter: Parts has no filter to widen.');
  } else {
    const filter = {
      ...tab.basicFilter,
      range: {
        sheetId: tab.properties!.sheetId,
        startRowIndex: 0,
        startColumnIndex: 0,
        endColumnIndex: tab.properties!.gridProperties!.columnCount!,
      },
    };
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ setBasicFilter: { filter } }] } });
    console.log(`Filter: widened to every column (${tab.properties!.gridProperties!.columnCount}) and every row, other settings kept.`);
  }
}
console.log('');
