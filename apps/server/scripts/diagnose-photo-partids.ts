/**
 * Read-only. For every photo in the folder, compares the SKU the photo was taken of with
 * the SKU of the row its partId now points at. A constant offset means rows shifted; a
 * scatter means the sheet was sorted with the partId column left out.
 *
 *   npx tsx scripts/diagnose-photo-partids.ts
 */
import { env } from '../src/config/env.js';
import { getDriveClient } from '../src/google/client.js';
import { getAllParts } from '../src/google/sheetsService.js';
import { extractSkuFromFileName } from '../src/lib/photoNaming.js';

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9-]/g, '');
const parts = await getAllParts();
const ordinal = new Map<string, number>();
parts.forEach((p, i) => ordinal.set(p.id, i));

const idCounts = new Map<string, number>();
for (const p of parts) idCounts.set(p.id, (idCounts.get(p.id) ?? 0) + 1);
const dupIds = [...idCounts].filter(([, n]) => n > 1);
const nonUuid = parts.filter((p) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id));
console.log(`\nRows: ${parts.length}   duplicate ids: ${dupIds.length}   non-UUID ids: ${nonUuid.length}`);
for (const [id, n] of dupIds.slice(0, 5)) console.log(`   dup ${id} x${n}: ${parts.filter((p) => p.id === id).map((p) => p.sku).join(', ')}`);

const ordinalsBySku = new Map<string, number[]>();
parts.forEach((p, i) => {
  const k = norm(p.sku);
  ordinalsBySku.set(k, [...(ordinalsBySku.get(k) ?? []), i]);
});

const drive = getDriveClient();
const files: { name: string; partId?: string; sku: string; created: string }[] = [];
let pageToken: string | undefined;
do {
  const res = await drive.files.list({
    q: `'${env.googleDriveFolderId}' in parents and trashed = false`,
    fields: 'nextPageToken, files(name, createdTime, properties)',
    pageSize: 1000,
    pageToken,
  });
  for (const f of res.data.files ?? []) {
    files.push({
      name: f.name ?? '',
      partId: f.properties?.partId ?? undefined,
      sku: norm(f.properties?.sku ?? extractSkuFromFileName(f.name ?? '') ?? ''),
      created: (f.createdTime ?? '').slice(0, 10),
    });
  }
  pageToken = res.data.nextPageToken ?? undefined;
} while (pageToken);

let match = 0, orphan = 0;
const mismatches: { name: string; rowSku: string; i: number; delta: number | null; created: string }[] = [];
const byDay = new Map<string, { ok: number; bad: number }>();
const bucket = new Map<number, { ok: number; bad: number }>();

for (const f of files) {
  if (!f.partId) continue;
  const i = ordinal.get(f.partId);
  if (i === undefined) { orphan++; continue; }
  const ok = norm(parts[i].sku) === f.sku;
  const d = byDay.get(f.created) ?? { ok: 0, bad: 0 };
  const b = bucket.get(Math.floor(i / 200)) ?? { ok: 0, bad: 0 };
  if (ok) { match++; d.ok++; b.ok++; }
  else {
    d.bad++; b.bad++;
    const homes = ordinalsBySku.get(f.sku) ?? [];
    const nearest = homes.length ? homes.reduce((a, j) => (Math.abs(j - i) < Math.abs(a - i) ? j : a)) : null;
    mismatches.push({ name: f.name, rowSku: parts[i].sku, i, delta: nearest === null ? null : nearest - i, created: f.created });
  }
  byDay.set(f.created, d);
  bucket.set(Math.floor(i / 200), b);
}

console.log(`\nPhotos with a partId: ${match + mismatches.length + orphan}`);
console.log(`  row SKU matches photo SKU : ${match}`);
console.log(`  row SKU DIFFERS           : ${mismatches.length}`);
console.log(`  partId matches no row     : ${orphan}`);

const deltas = new Map<string, number>();
for (const m of mismatches) deltas.set(String(m.delta), (deltas.get(String(m.delta)) ?? 0) + 1);
console.log('\nOffset from the partId row to the nearest row that really has that SKU:');
for (const [d, n] of [...deltas].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${String(n).padStart(5)}  offset ${d}`);

console.log('\nBy the row the partId points at (200-row bands):');
for (const [k, v] of [...bucket].sort((a, b) => a[0] - b[0])) console.log(`  rows ${String(k * 200).padStart(4)}-${String(k * 200 + 199).padEnd(4)}  ok ${String(v.ok).padStart(4)}  wrong ${String(v.bad).padStart(4)}`);

console.log('\nBy the day the photo was taken:');
for (const [day, v] of [...byDay].sort()) console.log(`  ${day}  ok ${String(v.ok).padStart(4)}  wrong ${String(v.bad).padStart(4)}`);

console.log('\nSamples:');
for (const m of mismatches.slice(0, 10)) console.log(`  ${m.name.padEnd(40)} -> row ${m.i} is ${m.rowSku}   offset ${m.delta}`);
console.log('');
