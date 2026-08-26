/**
 * Links eBay listings to parts by their Custom Label, so nobody has to copy a listing id
 * across by hand.
 *
 *   npx tsx scripts/match-listings.ts            report only
 *   npx tsx scripts/match-listings.ts --apply    writes the listing id onto matching parts
 *
 * eBay returns the Custom Label as the listing's SKU. Where that equals a part's SKU the
 * link is unambiguous, so the listing id and the listed flag can be filled in from it.
 * A part that already carries a listing id is never touched.
 */
import { fetchListings } from '../src/ebay/listingsService.js';
import { getAllParts, updatePart } from '../src/google/sheetsService.js';

const apply = process.argv.includes('--apply');

const [listings, parts] = await Promise.all([fetchListings(), getAllParts()]);

const alreadyLinked = new Set(parts.map((p) => p.ebayListingId).filter((v): v is string => !!v));

const partsBySku = new Map<string, typeof parts>();
for (const p of parts) {
  const key = p.sku.toUpperCase();
  const bucket = partsBySku.get(key);
  if (bucket) bucket.push(p);
  else partsBySku.set(key, [p]);
}

console.log(`\nActive listings: ${listings.length}    Parts: ${parts.length}\n`);
console.log(`Carrying a Custom Label   : ${listings.filter((l) => l.sku).length}`);
console.log(`Without a Custom Label    : ${listings.filter((l) => !l.sku).length}`);
console.log(`Already linked to a part  : ${listings.filter((l) => alreadyLinked.has(l.ebayListingId)).length}\n`);

const linkable: { listingId: string; sku: string; partId: string; site: string; wasListed: boolean }[] = [];
const noLabel: typeof listings = [];
const noSuchPart: typeof listings = [];

for (const l of listings) {
  if (alreadyLinked.has(l.ebayListingId)) continue;
  if (!l.sku) {
    noLabel.push(l);
    continue;
  }
  const candidates = partsBySku.get(l.sku.toUpperCase());
  if (!candidates?.length) {
    noSuchPart.push(l);
    continue;
  }
  // Never overwrite an existing link: prefer a row that has no listing id yet.
  const target = candidates.find((p) => !p.ebayListingId) ?? candidates[0];
  linkable.push({
    listingId: l.ebayListingId,
    sku: l.sku,
    partId: target.id,
    site: target.inventorySite,
    wasListed: target.itemListed,
  });
}

console.log(`Can be linked by Custom Label: ${linkable.length}`);
for (const m of linkable) {
  console.log(
    `  ${m.listingId}  ->  ${m.sku.padEnd(24)} ${m.site.slice(0, 18).padEnd(18)}` +
      `${m.wasListed ? '' : '  (also marks it listed)'}`
  );
}

console.log(`\nNo Custom Label set: ${noLabel.length}`);
for (const l of noLabel.slice(0, 10)) console.log(`  ${l.ebayListingId}  ${l.title.slice(0, 52)}`);

console.log(`\nLabel matches no part: ${noSuchPart.length}`);
for (const l of noSuchPart.slice(0, 10)) console.log(`  ${l.ebayListingId}  ${l.sku.padEnd(24)} ${l.title.slice(0, 40)}`);
console.log('');

if (!apply) {
  console.log('Report only. Re-run with --apply to write these links.\n');
} else {
  let done = 0;
  for (const m of linkable) {
    await updatePart(m.partId, { ebayListingId: m.listingId, itemListed: true });
    done++;
  }
  console.log(`Linked ${done} part(s).\n`);
}
