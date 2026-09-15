/**
 * DRY RUN — writes nothing to Google. Plans the repair of the 09-08 partial sort.
 *
 * The Parts tab's filter covered A1:V1104 while the sheet runs to AH, so sorting it
 * reordered A–V and left W–AH (revenuePriorityRank … partId … ebayDraftUrl) where they
 * were. This works out, for every affected row, which W–AH values belong with the A–V
 * data now in it, keeping any W–AH edit made since the sort (those were made by someone
 * looking at the data now in that row), and projects the photo match rate afterwards.
 *
 *   npx tsx scripts/plan-sort-restore.ts <dir with parts-rev-2893.csv and parts-rev-2905.csv>
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { env } from '../src/config/env.js';
import { getDriveClient, getSheetsClient } from '../src/google/client.js';

const dir = process.argv[2];
if (!dir) throw new Error('Pass the directory holding the revision exports.');

const W = 22; // column W, the first one the sort left behind
const END = 34; // through AH
const PID = 27; // AB
const Q = 16; // updatedAt, the sort key
const LAST = 1103; // index of sheet row 1104, the filter's last row
const SORT_AT = Date.parse('2026-09-08T20:11:20Z');
const COLS = ['W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH'];

const pad = (r: unknown[]): string[] => {
  const x = r.slice(0, END).map((v) => (v == null ? '' : String(v)));
  while (x.length < END) x.push('');
  return x;
};
const load = (f: string): string[][] =>
  (parse(fs.readFileSync(path.join(dir, f), 'utf8'), { relax_column_count: true }) as unknown[][]).map(pad);

const pre = load('parts-rev-2893.csv');
const post = load('parts-rev-2905.csv');
const curRes = await getSheetsClient().spreadsheets.values.get({
  spreadsheetId: env.googleSheetId!,
  range: 'Parts!A1:AH',
});
const cur = (curRes.data.values ?? []).map(pad);

const backupFile = path.join(dir, `parts-live-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(backupFile, JSON.stringify(cur));
console.log(`\nLive Parts tab backed up to ${backupFile}`);
console.log(`Headers  pre AB=${pre[0][PID]}  post AB=${post[0][PID]}  live AB=${cur[0][PID]}  live Q=${cur[0][Q]}`);
console.log(`Rows     pre ${pre.length}  post ${post.length}  live ${cur.length}`);

// 1. Is it really a sort of A-V within rows 2-1104?
const SEP = String.fromCharCode(1);
const av = (r: string[]) => r.slice(0, W).join(SEP);
const wp = (r: string[]) => r.slice(W, END).join(SEP);
let wUnmoved = 0;
let wChanged = 0;
let tailSame = 0;
let tailDiff = 0;
let avSamePos = 0;
for (let i = 1; i < Math.min(pre.length, post.length); i++) {
  if (i <= LAST) {
    if (wp(pre[i]) === wp(post[i])) wUnmoved++;
    else wChanged++;
    if (av(pre[i]) === av(post[i])) avSamePos++;
  } else if (av(pre[i]) + wp(pre[i]) === av(post[i]) + wp(post[i])) {
    tailSame++;
  } else {
    tailDiff++;
  }
}
let inversions = 0;
for (let i = 2; i <= LAST; i++) {
  const a = Date.parse(post[i - 1][Q]);
  const b = Date.parse(post[i][Q]);
  if (!Number.isNaN(a) && !Number.isNaN(b) && b > a) inversions++;
}
console.log('\nSort check (rev 2893 at 18:42 vs rev 2905 at 20:11):');
console.log(`  rows 2-1104: W-AH unchanged in place ${wUnmoved}, changed ${wChanged}`);
console.log(`  rows 2-1104: A-V still in the same row ${avSamePos} of ${LAST}`);
console.log(`  rows 1105+ : identical ${tailSame}, differ ${tailDiff}`);
console.log(`  post A-V ordered by updatedAt descending: ${inversions} inversions`);

// 2. Where did each post row's A-V come from?
const key2 = (r: string[]) => [r[0], r[3], r[4], r[14], r[15]].map((v) => v.trim().toUpperCase()).join('|');
const byTuple = new Map<string, number[]>();
const byKey2 = new Map<string, number[]>();
for (let q = 1; q <= LAST; q++) {
  byTuple.set(av(pre[q]), [...(byTuple.get(av(pre[q])) ?? []), q]);
  byKey2.set(key2(pre[q]), [...(byKey2.get(key2(pre[q])) ?? []), q]);
}
const used = new Set<number>();
const sigma = new Map<number, number>();
let exact = 0;
let byKey = 0;
for (let r = 1; r <= LAST; r++) {
  const q = (byTuple.get(av(post[r])) ?? []).find((x) => !used.has(x));
  if (q !== undefined) {
    sigma.set(r, q);
    used.add(q);
    exact++;
  }
}
for (let r = 1; r <= LAST; r++) {
  if (sigma.has(r)) continue;
  const q = (byKey2.get(key2(post[r])) ?? []).find((x) => !used.has(x));
  if (q !== undefined) {
    sigma.set(r, q);
    used.add(q);
    byKey++;
  }
}
console.log(`\nMatched post rows to pre rows: exact ${exact}, by sku/site/bin/legacy/seq ${byKey}, unmatched ${LAST - sigma.size}`);

// partId P (still in the row the data moved into) -> P' (the data's true partId).
const pi = new Map<string, string>();
let identity = 0;
for (const [r, q] of sigma) {
  const P = post[r][PID];
  const Pt = post[q][PID];
  if (!P || !Pt) continue;
  pi.set(P, Pt);
  if (P === Pt) identity++;
}
console.log(`partIds re-paired: ${pi.size - identity}   already correct: ${identity}`);

// 3. The writes
const postRowByPid = new Map<string, number>();
post.forEach((r, i) => {
  if (i > 0 && r[PID]) postRowByPid.set(r[PID], i);
});
const norm = (v: string, c: number) => {
  const t = v.trim();
  if (c === 29) return t.toUpperCase() === 'TRUE' ? 'TRUE' : ''; // needsReview: blank is FALSE
  return t;
};

interface Write {
  row: number;
  sku: string;
  from: string[];
  to: string[];
}
const writes: Write[] = [];
const keptEdits: string[] = [];
const colChanges = new Array<number>(END - W).fill(0);
let rowsAffectedLive = 0;

for (let k = 1; k < cur.length; k++) {
  const P = cur[k][PID];
  const Pt = pi.get(P);
  if (!P || Pt === undefined) continue;
  rowsAffectedLive++;
  const r = postRowByPid.get(P)!;
  const q = sigma.get(r)!;
  const to = cur[k].slice(W, END);
  for (let c = W; c < END; c++) {
    if (c === PID) {
      to[c - W] = Pt;
      continue;
    }
    const atSort = post[r][c];
    const now = cur[k][c];
    const original = post[q][c];
    if (norm(now, c) !== norm(atSort, c)) {
      if (norm(original, c) !== norm(now, c)) {
        keptEdits.push(`row ${k + 1} ${cur[k][0]} ${COLS[c - W]}: kept "${now}" (was "${atSort}" at sort; data's own "${original}")`);
      }
      to[c - W] = now;
    } else {
      to[c - W] = original;
    }
  }
  const from = cur[k].slice(W, END);
  if (to.some((v, i) => norm(v, i + W) !== norm(from[i], i + W))) {
    to.forEach((v, i) => {
      if (norm(v, i + W) !== norm(from[i], i + W)) colChanges[i]++;
    });
    writes.push({ row: k + 1, sku: cur[k][0], from, to });
  }
}
console.log(`\nLive rows carrying an affected partId: ${rowsAffectedLive}`);
console.log(`Rows to rewrite (W-AH only): ${writes.length}`);
console.log('Cells changing per column: ' + COLS.map((c, i) => `${c}=${colChanges[i]}`).join('  '));
console.log(`Edits made since the sort, kept with the data they were made against: ${keptEdits.length}`);
for (const e of keptEdits.slice(0, 10)) console.log(`  ${e}`);

console.log('\nSample rewrites (Y = activeRecoveryPriceBasis, AC = newBinLocation, AD = needsReview):');
for (const w of writes.slice(0, 6)) {
  console.log(
    `  row ${w.row} ${w.sku.padEnd(16)} Y ${w.from[2] || '-'} -> ${w.to[2] || '-'}   AC ${w.from[6] || '-'} -> ${w.to[6] || '-'}   AD ${w.from[7] || '-'} -> ${w.to[7] || '-'}`
  );
}

// 4. Photos, before and after
const skuNow = new Map<string, string>();
for (let k = 1; k < cur.length; k++) if (cur[k][PID]) skuNow.set(cur[k][PID], cur[k][0].trim().toUpperCase());
const skuAfter = new Map(skuNow);
const movedAway = new Set(writes.filter((w) => w.from[PID - W] !== w.to[PID - W]).map((w) => w.from[PID - W]));
const reassigned = new Set(writes.map((w) => w.to[PID - W]));
for (const pid of movedAway) if (!reassigned.has(pid)) skuAfter.delete(pid);
for (const w of writes) skuAfter.set(w.to[PID - W], w.sku.trim().toUpperCase());

const drive = getDriveClient();
const photos: { id: string; name: string; partId?: string; sku: string; created: number }[] = [];
let pageToken: string | undefined;
do {
  const res = await drive.files.list({
    q: `'${env.googleDriveFolderId}' in parents and trashed = false`,
    fields: 'nextPageToken, files(id, name, createdTime, properties)',
    pageSize: 1000,
    pageToken,
  });
  for (const f of res.data.files ?? []) {
    photos.push({
      id: f.id!,
      name: f.name ?? '',
      partId: f.properties?.partId ?? undefined,
      sku: (f.properties?.sku ?? '').trim().toUpperCase(),
      created: Date.parse(f.createdTime ?? ''),
    });
  }
  pageToken = res.data.nextPageToken ?? undefined;
} while (pageToken);

let okNow = 0;
let okAfter = 0;
let unresolved = 0;
let noSku = 0;
const restamps: { fileId: string; name: string; from: string; to: string }[] = [];
const unresolvedSamples: string[] = [];
for (const ph of photos) {
  if (!ph.partId) continue;
  if (!ph.sku) {
    noSku++;
    continue;
  }
  if (skuNow.get(ph.partId) === ph.sku) okNow++;
  if (skuAfter.get(ph.partId) === ph.sku) {
    okAfter++;
    continue;
  }
  // Taken after the sort: stamped with the partId of the row as it then stood.
  const target = pi.get(ph.partId);
  if (ph.created > SORT_AT && target && skuAfter.get(target) === ph.sku) {
    restamps.push({ fileId: ph.id, name: ph.name, from: ph.partId, to: target });
  } else {
    unresolved++;
    if (unresolvedSamples.length < 25) {
      unresolvedSamples.push(
        `${ph.name}  partId row -> ${skuAfter.get(ph.partId) ?? '(no row)'}  created ${new Date(ph.created).toISOString().slice(0, 10)}`
      );
    }
  }
}
console.log(`\nPhotos (${photos.length}, ${noSku} without a sku property):`);
console.log(`  matching their row now          : ${okNow}`);
console.log(`  matching after the W-AH rewrite : ${okAfter}`);
console.log(`  post-sort photos to re-stamp    : ${restamps.length}`);
console.log(`  still unresolved                : ${unresolved}`);
for (const s of unresolvedSamples) console.log(`    ${s}`);

const planFile = path.join(dir, 'restore-plan.json');
fs.writeFileSync(planFile, JSON.stringify({ generatedAt: new Date().toISOString(), writes, restamps, keptEdits }, null, 1));
console.log(`\nPlan saved to ${planFile} - nothing was written to Google.\n`);
