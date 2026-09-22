/**
 * Why the backlog count and the research in Drive disagree. Reads only: lists the research
 * folder, then shows which ready-to-list parts are still counted as unresearched.
 *
 *   npx tsx scripts/check-research-backlog.ts
 */
import { draftReadiness, groupPartsBySku } from '@warehouse/shared';
import { env } from '../src/config/env.js';
import { getDriveUploadClient } from '../src/google/client.js';
import { getAllParts } from '../src/google/sheetsService.js';
import { backlogGroups, researchedSkus } from '../src/ebay/researchBatch.js';

const drive = getDriveUploadClient();
const list = await drive.files.list({
  q: `'${env.researchFolderId}' in parents and trashed = false`,
  pageSize: 1000,
  orderBy: 'createdTime desc',
  fields: 'files(name,createdTime,mimeType)',
});
const files = list.data.files ?? [];
console.log(`Files in the research folder: ${files.length}`);
for (const f of files.slice(0, 20)) console.log(`  ${f.name}  ${f.createdTime}  ${f.mimeType}`);

const done = await researchedSkus();
console.log(`\nSKUs taken as researched: ${done.size}`);

const groups = groupPartsBySku(await getAllParts()).filter((g) => draftReadiness(g).ready);
console.log(`Ready to list: ${groups.length}`);
const backlog = await backlogGroups();
console.log(`Counted as still needing research: ${backlog.length}`);

const namedButCounted = backlog
  .map((g) => g.sku)
  .filter((sku) => files.some((f) => (f.name ?? '').replace(/\.md$/i, '').trim().toLowerCase() === sku.trim().toLowerCase()));
console.log(`\nIn the folder yet still in the backlog: ${namedButCounted.length}`, namedButCounted);
