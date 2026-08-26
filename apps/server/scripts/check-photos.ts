/**
 * Works out why a part that says it is photographed shows no photos.
 *
 *   npx tsx scripts/check-photos.ts 5S9062
 *
 * Photos are tied to a part by a `partId` file property, falling back to a `sku` property
 * and finally to the filename. Any of those can miss, and the folder listing only sees
 * direct children — a file in a subfolder is invisible to the app but still turns up in
 * Drive's own search, which is exactly what "I can find it in Drive" looks like.
 */
import { env } from '../src/config/env.js';
import { getDriveClient } from '../src/google/client.js';
import { extractSkuFromFileName } from '../src/lib/photoNaming.js';

const sku = process.argv[2] ?? '5S9062';
const drive = getDriveClient();

async function listAll(q: string) {
  const out: {
    id: string;
    name: string;
    parents?: string[];
    properties?: Record<string, string>;
    mimeType?: string;
    trashed?: boolean;
  }[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q,
      fields: 'nextPageToken, files(id, name, parents, properties, mimeType, trashed)',
      pageSize: 200,
      pageToken,
      // Without this a shared-drive file simply does not come back.
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files ?? []) {
      out.push(f as (typeof out)[number]);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

console.log(`\nConfigured photo folder: ${env.googleDriveFolderId}\n`);

// 1 · Exactly what the app sees.
const inFolder = await listAll(`'${env.googleDriveFolderId}' in parents and trashed = false`);
console.log(`Files directly in that folder (what the app lists): ${inFolder.length}`);

// 2 · Everything the service account can see with this SKU in the name, anywhere.
const anywhere = await listAll(`name contains '${sku}' and trashed = false`);
console.log(`Files anywhere named like "${sku}": ${anywhere.length}\n`);

if (anywhere.length === 0) {
  console.log('The service account cannot see any such file. If Drive shows it to you, the');
  console.log('file or its folder is not shared with the service account.\n');
}

for (const f of anywhere) {
  const inConfigured = (f.parents ?? []).includes(env.googleDriveFolderId ?? '');
  const partId = f.properties?.partId;
  const skuProp = f.properties?.sku;
  const fromName = extractSkuFromFileName(f.name);
  console.log(`  ${f.name}`);
  console.log(`     in the configured folder : ${inConfigured ? 'yes' : `NO (parents: ${(f.parents ?? []).join(', ') || 'none'})`}`);
  console.log(`     partId property          : ${partId ?? '—'}`);
  console.log(`     sku property             : ${skuProp ?? '—'}`);
  console.log(`     sku parsed from name     : ${fromName ?? '—'}`);
  console.log(`     trashed                  : ${f.trashed ? 'YES' : 'no'}`);
  console.log('');
}

// 3 · How the folder's own files break down, since one bad case is rarely alone.
let withPartId = 0;
let withSkuProp = 0;
let nameOnly = 0;
let unmatchable = 0;
for (const f of inFolder) {
  if (f.properties?.partId) withPartId++;
  else if (f.properties?.sku) withSkuProp++;
  else if (extractSkuFromFileName(f.name)) nameOnly++;
  else unmatchable++;
}
console.log('How the folder\'s files are identified:');
console.log(`  by partId property : ${withPartId}`);
console.log(`  by sku property    : ${withSkuProp}`);
console.log(`  by filename only   : ${nameOnly}`);
console.log(`  no way to match    : ${unmatchable}`);
console.log('');
