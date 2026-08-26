/**
 * Checks the invariant the photo bug broke: nothing should read as photographed and then
 * show no photographs.
 *
 *   npx tsx scripts/verify-photos.ts            checks against the live sheet
 *   npx tsx scripts/verify-photos.ts --fetch    also fetches every photo to prove it loads
 *
 * Runs the real grouping code over the real data, so it tests what the board actually
 * does rather than a restatement of it.
 */
import { getCheckpoints, groupPartsBySku } from '@warehouse/shared';
import { getAllParts } from '../src/google/sheetsService.js';

const alsoFetch = process.argv.includes('--fetch');

const parts = await getAllParts();
const groups = groupPartsBySku(parts);

console.log(`\nRows: ${parts.length}   SKUs: ${groups.length}\n`);

let withPhotos = 0;
let photographedButEmpty = 0;
let photosButNotFlagged = 0;
let primaryWouldHaveMissed = 0;
let totalPhotos = 0;

const missed: string[] = [];
const empty: string[] = [];

for (const g of groups) {
  const groupCount = g.photos.length;
  const primaryCount = g.primary.photos.length;
  totalPhotos += groupCount;
  if (groupCount > 0) withPhotos++;

  // The symptom that was reported.
  if (getCheckpoints(g).photographed && groupCount === 0) {
    photographedButEmpty++;
    empty.push(g.sku);
  }
  // Photos present but the flag never set — the mirror image, worth knowing about.
  if (groupCount > 0 && !getCheckpoints(g).photographed) photosButNotFlagged++;

  // What the old code would have shown, to confirm each previously broken case is fixed.
  if (groupCount > primaryCount) {
    primaryWouldHaveMissed++;
    missed.push(`${g.sku}: shows ${groupCount}, primary row alone held ${primaryCount}`);
  }
}

console.log(`SKUs with at least one photo            : ${withPhotos}`);
console.log(`Total photos attached                   : ${totalPhotos}`);
console.log(`Reads photographed but shows none       : ${photographedButEmpty}`);
console.log(`Has photos but is not flagged           : ${photosButNotFlagged}`);
console.log(`Previously hidden by the primary-row bug: ${primaryWouldHaveMissed}\n`);

if (missed.length) {
  console.log('Now showing photos that the old code hid:');
  for (const m of missed) console.log(`  ${m}`);
  console.log('');
}

if (empty.length) {
  console.log('Still reading photographed with nothing to show:');
  for (const e of empty) console.log(`  ${e}`);
  console.log('');
}

if (alsoFetch) {
  // A photo can be attached and still fail to display if the Drive file has gone.
  const base = process.env.VERIFY_BASE ?? 'http://localhost:4000';
  console.log(`Fetching every photo through ${base} ...`);
  let ok = 0;
  const broken: string[] = [];
  for (const g of groups) {
    for (const p of g.photos) {
      const res = await fetch(`${base}${p.url}`, { method: 'GET' });
      if (res.ok) ok++;
      else broken.push(`${g.sku} ${p.fileName} -> HTTP ${res.status}`);
      // Drained so the connection is released before the next request.
      await res.arrayBuffer().catch(() => undefined);
    }
  }
  console.log(`  loaded ${ok} of ${totalPhotos}`);
  for (const b of broken) console.log(`  BROKEN ${b}`);
  console.log('');
}

const clean = photographedButEmpty === 0;
console.log(clean ? 'No part reads photographed without photos.\n' : 'Some parts still read photographed with no photos.\n');
process.exit(clean ? 0 : 1);
