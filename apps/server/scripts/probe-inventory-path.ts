/**
 * The Listing Draft API turned out to be a Limited Release we are not approved for, so the
 * fallback is the Inventory API. That path needs more than a scope: business policies, a
 * merchant location and a category per item. This reports which of those exist.
 *
 *   npx tsx scripts/probe-inventory-path.ts
 */
import { env } from '../src/config/env.js';
import { ebayBaseUrl, getAccessToken } from '../src/ebay/client.js';

const token = await getAccessToken();

async function probe(label: string, path: string) {
  const res = await fetch(`${ebayBaseUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'X-EBAY-C-MARKETPLACE-ID': env.ebayMarketplaceId,
    },
  });
  const text = await res.text();
  let note = text.slice(0, 200);
  try {
    const json = JSON.parse(text);
    if (json.errors?.[0]) note = `${json.errors[0].errorId} ${json.errors[0].message}`;
    else note = `${text.slice(0, 200)}`;
  } catch {
    /* keep raw */
  }
  console.log(`${res.status === 200 ? 'OK  ' : 'FAIL'} ${String(res.status).padEnd(4)} ${label}`);
  if (res.status !== 200) console.log(`          ${note}`);
  return { status: res.status, text };
}

console.log('\n--- what the Inventory API path needs ---\n');
await probe('business policies: fulfillment', '/sell/account/v1/fulfillment_policy?marketplace_id=' + env.ebayMarketplaceId);
await probe('business policies: payment', '/sell/account/v1/payment_policy?marketplace_id=' + env.ebayMarketplaceId);
await probe('business policies: return', '/sell/account/v1/return_policy?marketplace_id=' + env.ebayMarketplaceId);
await probe('merchant locations', '/sell/inventory/v1/location');
await probe('existing offers', '/sell/inventory/v1/offer?sku=NOPE&limit=1');

// Category suggestion is what would let a draft pick its own category.
const tree = await probe('category tree id (US)', '/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=' + env.ebayMarketplaceId);
if (tree.status === 200) {
  const id = JSON.parse(tree.text).categoryTreeId;
  await probe(
    'category suggestion for a real title',
    `/commerce/taxonomy/v1/category_tree/${id}/get_category_suggestions?q=` +
      encodeURIComponent('Mack Trucks CARTRIDGE AIR DRYER R950069')
  );
}
console.log('');
