/**
 * Shows the drafts the app would create, without creating anything.
 *
 *   npx tsx scripts/preview-drafts.ts [howMany]
 *
 * Composition is worth reading before it reaches eBay: a bad title is worse than no
 * listing, and this is the cheapest place to notice one.
 */
import { composeDraft, draftReadiness, groupPartsBySku } from '@warehouse/shared';
import { getAllParts } from '../src/google/sheetsService.js';

const show = Number(process.argv[2] ?? 6);
const IMAGE_BASE = process.env.PUBLIC_BASE_URL ?? 'https://calfracusebayinventoryapp.onrender.com';

const groups = groupPartsBySku(await getAllParts());

const ready = groups.filter((g) => draftReadiness(g).ready);
const needsPrice = ready.filter((g) => draftReadiness(g).missing.includes('price'));

console.log(`\nDraftable now      : ${ready.length}`);
console.log(`  of those, priced : ${ready.length - needsPrice.length}`);
console.log(`  awaiting a price : ${needsPrice.length}\n`);

// Why the rest cannot be drafted, so the gaps are addressable rather than mysterious.
const blockerCounts = new Map<string, number>();
for (const g of groups) {
  for (const b of draftReadiness(g).blockers) blockerCounts.set(b, (blockerCounts.get(b) ?? 0) + 1);
}
console.log('Why the others are not draftable:');
for (const [reason, n] of [...blockerCounts].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${reason}`);
}

console.log(`\n--- first ${show} drafts ---`);
for (const g of ready.slice(0, show)) {
  const d = composeDraft(g, IMAGE_BASE)!;
  console.log(`\n  TITLE      ${d.title}   (${d.title.length} chars)`);
  console.log(`  CONDITION  ${d.condition}   "${d.conditionDescription}"`);
  console.log(`  PRICE      ${d.price != null ? '$' + d.price.toFixed(2) : '(blank — you set it)'}`);
  console.log(`  QUANTITY   ${d.quantity}`);
  console.log(`  BRAND/MPN  ${d.brand ?? '—'} / ${d.mpn}`);
  console.log(`  PHOTOS     ${d.imageUrls.length}`);
  console.log(`  BODY       ${d.descriptionHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110)}...`);
}
console.log('');
