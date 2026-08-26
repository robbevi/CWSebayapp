/**
 * Establishes what stands between the app and creating a draft listing: which of the APIs
 * a draft needs are reachable with the token we hold, and which need a fresh consent.
 *
 *   npx tsx scripts/probe-draft-apis.ts
 */
import { env } from '../src/config/env.js';
import { ebayBaseUrl, getAccessToken } from '../src/ebay/client.js';

const token = await getAccessToken();

async function probe(label: string, path: string, need: string) {
  const res = await fetch(`${ebayBaseUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'X-EBAY-C-MARKETPLACE-ID': env.ebayMarketplaceId,
      'Accept-Language': 'en-US',
      'Content-Language': 'en-US',
    },
  });
  const text = await res.text();
  const ok = res.ok;
  console.log(`\n${label}`);
  console.log(`  ${ok ? 'REACHABLE' : 'blocked'}  HTTP ${res.status}   needs: ${need}`);
  if (!ok) console.log(`  ${text.slice(0, 160)}`);
  else console.log(`  ${text.slice(0, 200)}`);
  return ok;
}

console.log('\nWhat a draft listing needs, and whether we can get at it today.');

// Business policies: an offer cannot exist without payment, return and fulfilment ids.
await probe('Payment policies', '/sell/account/v1/payment_policy?marketplace_id=EBAY_US', 'sell.account.readonly');
await probe('Return policies', '/sell/account/v1/return_policy?marketplace_id=EBAY_US', 'sell.account.readonly');
await probe(
  'Fulfilment policies',
  '/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US',
  'sell.account.readonly'
);

// Category: eBay will not take a listing without one, and we hold no category per part.
await probe(
  'Category suggestion',
  '/commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=Cummins%20V%20Ribbed%20Belt',
  'api_scope (basic)'
);

// Inventory write is what actually creates the unpublished offer that is a draft.
await probe('Inventory items (read is a proxy for write)', '/sell/inventory/v1/inventory_item?limit=1', 'sell.inventory (write)');

console.log('\nA photo has to be fetchable by eBay, from the public internet.');
const prod = 'https://calfracusebayinventoryapp.onrender.com';
const res = await fetch(`${prod}/api/parts`);
const parts = (await res.json()) as { photos?: { url: string }[] }[];
const withPhoto = parts.find((p) => (p.photos?.length ?? 0) > 0);
if (withPhoto?.photos?.[0]) {
  const url = `${prod}${withPhoto.photos[0].url}`;
  const img = await fetch(url);
  console.log(`  ${img.ok ? 'REACHABLE' : 'blocked'}  HTTP ${img.status}  ${img.headers.get('content-type')}  ${url}`);
} else {
  console.log('  no photo found to test');
}
console.log('');
