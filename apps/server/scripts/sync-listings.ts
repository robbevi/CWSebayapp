/**
 * Pulls live listing data — watchers, asking price, quantity left, views — into the
 * Listings tab.
 *
 *   npx tsx scripts/sync-listings.ts            dry run
 *   npx tsx scripts/sync-listings.ts --apply    writes
 */
import { fetchListings } from '../src/ebay/listingsService.js';
import { replaceListings } from '../src/google/sheetsService.js';

const apply = process.argv.includes('--apply');

const listings = await fetchListings();
console.log(`\nActive listings: ${listings.length}\n`);

const ranked = [...listings].sort((a, b) => b.watchers - a.watchers || (b.views ?? 0) - (a.views ?? 0));

console.log('  listing         watch   qty      price   views  impr   title');
for (const l of ranked.slice(0, 15)) {
  console.log(
    `  ${l.ebayListingId.padEnd(14)} ${String(l.watchers).padStart(5)} ${String(l.quantityAvailable).padStart(5)} ` +
      `${l.price.toFixed(2).padStart(10)} ${String(l.views ?? '-').padStart(7)} ${String(l.impressions ?? '-').padStart(5)}   ${l.title.slice(0, 34)}`
  );
}

const totals = listings.reduce(
  (a, l) => ({
    watchers: a.watchers + l.watchers,
    views: a.views + (l.views ?? 0),
    impressions: a.impressions + (l.impressions ?? 0),
    value: a.value + l.price * l.quantityAvailable,
  }),
  { watchers: 0, views: 0, impressions: 0, value: 0 }
);
console.log(
  `\n  ${totals.watchers} watchers, ${totals.views} views, ${totals.impressions} impressions, ` +
    `$${totals.value.toLocaleString('en-US', { maximumFractionDigits: 0 })} listed at asking price\n`
);

if (!apply) {
  console.log('Dry run. Re-run with --apply to write the Listings tab.\n');
} else {
  const written = await replaceListings(listings);
  console.log(`Wrote ${written} listing(s) to the Listings tab.\n`);
}
