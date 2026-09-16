/**
 * Feasibility probe for publishing listings through the Trading API. Creates nothing:
 * GetItem, GetUserPreferences and GetSuggestedCategories only read, and VerifyAddItem
 * validates a complete listing and quotes its fees without listing it.
 *
 *   npx tsx scripts/probe-trading-listing.ts [existingListingId] [sparePartSku] [postalCodeOverride]
 *
 * The existing listing shows how the team already lists — category, condition, business
 * policies, ship-from — so the verified listing copies that rather than inventing it.
 */
import { composeDraft, groupPartsBySku } from '@warehouse/shared';
import { env } from '../src/config/env.js';
import { ebayBaseUrl, getAccessToken } from '../src/ebay/client.js';
import { getAllParts } from '../src/google/sheetsService.js';

const LISTING_ID = process.argv[2] ?? '398363871163';
const SKU = process.argv[3] ?? '35-514-231-R-901';
const POSTAL_OVERRIDE = process.argv[4];

const ENDPOINT =
  env.ebayEnv === 'sandbox' ? 'https://api.sandbox.ebay.com/ws/api.dll' : 'https://api.ebay.com/ws/api.dll';

async function trading(call: string, inner: string, siteId = '0'): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': call,
      'X-EBAY-API-SITEID': siteId,
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
      'X-EBAY-API-IAF-TOKEN': token,
      'Content-Type': 'text/xml',
    },
    body: `<?xml version="1.0" encoding="utf-8"?><${call}Request xmlns="urn:ebay:apis:eBLBaseComponents">${inner}</${call}Request>`,
  });
  return res.text();
}

const all = (xml: string | undefined, name: string): string[] =>
  xml ? [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => m[1]) : [];
const one = (xml: string | undefined, name: string): string | undefined => all(xml, name)[0];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const report = (label: string, xml: string) => {
  console.log(`  Ack: ${one(xml, 'Ack')}`);
  for (const e of all(xml, 'Errors')) {
    console.log(`  ${one(e, 'SeverityCode')} ${one(e, 'ErrorCode')}: ${one(e, 'ShortMessage')}`);
    const long = one(e, 'LongMessage');
    if (long && long !== one(e, 'ShortMessage')) console.log(`      ${long.slice(0, 300)}`);
  }
  if (!one(xml, 'Ack')) console.log(`  (${label} raw) ${xml.slice(0, 300)}`);
};

// 1. How an existing listing is set up
console.log(`\n=== 1. Existing listing ${LISTING_ID} ===`);
const itemXml = await trading(
  'GetItem',
  `<ItemID>${LISTING_ID}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeItemSpecifics>true</IncludeItemSpecifics>`
);
report('GetItem', itemXml);
const item = one(itemXml, 'Item') ?? '';
const category = one(item, 'PrimaryCategory');
const profiles = one(item, 'SellerProfiles');
const shipProfile = one(profiles, 'SellerShippingProfile');
const returnProfile = one(profiles, 'SellerReturnProfile');
const payProfile = one(profiles, 'SellerPaymentProfile');
const pictures = all(one(item, 'PictureDetails'), 'PictureURL');
console.log(`  Title        : ${one(item, 'Title')}`);
console.log(`  SKU          : ${one(item, 'SKU') ?? '-'}`);
console.log(`  Category     : ${one(category, 'CategoryID')}  ${one(category, 'CategoryName')}`);
console.log(`  Condition    : ${one(item, 'ConditionID')}  ${one(item, 'ConditionDisplayName')}`);
console.log(`  Format       : ${one(item, 'ListingType')}  ${one(item, 'ListingDuration')}`);
console.log(`  Ship from    : ${one(item, 'Location')}  ${one(item, 'PostalCode')}  ${one(item, 'Country')}`);
console.log(`  Handling     : ${one(item, 'DispatchTimeMax') ?? '-'} days`);
console.log(`  Best Offer   : ${one(one(item, 'BestOfferDetails'), 'BestOfferEnabled') ?? '-'}`);
console.log(`  Profiles     : shipping ${one(shipProfile, 'ShippingProfileID') ?? '-'} "${one(shipProfile, 'ShippingProfileName') ?? ''}"`);
console.log(`                 return   ${one(returnProfile, 'ReturnProfileID') ?? '-'} "${one(returnProfile, 'ReturnProfileName') ?? ''}"`);
console.log(`                 payment  ${one(payProfile, 'PaymentProfileID') ?? '-'} "${one(payProfile, 'PaymentProfileName') ?? ''}"`);
console.log(`  Shipping     : ${one(one(item, 'ShippingDetails'), 'ShippingType') ?? '-'} via ${one(item, 'ShippingService') ?? '-'}`);
console.log(`  Pictures     : ${pictures.length} (${pictures[0]?.slice(0, 50) ?? '-'})`);
const pkg = one(item, 'ShippingPackageDetails');
console.log(`  Package      : ${one(pkg, 'ShippingPackage') ?? '-'}  ${one(pkg, 'PackageLength') ?? '?'}x${one(pkg, 'PackageWidth') ?? '?'}x${one(pkg, 'PackageDepth') ?? '?'} in, ${one(pkg, 'WeightMajor') ?? '?'} lb ${one(pkg, 'WeightMinor') ?? '?'} oz`);
const specifics = all(one(item, 'ItemSpecifics'), 'NameValueList').map((nv) => `${one(nv, 'Name')}=${all(nv, 'Value').join('|')}`);
console.log(`  Specifics    : ${specifics.join('; ') || '-'}`);
const desc = (one(item, 'Description') ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
console.log(`  Description  : ${desc.length} chars: ${desc.slice(0, 160)}`);

// 2. Business policies on the account
console.log('\n=== 2. Business policies ===');
const prefsXml = await trading('GetUserPreferences', '<ShowSellerProfilePreferences>true</ShowSellerProfilePreferences>');
report('GetUserPreferences', prefsXml);
console.log(`  Opted in: ${one(prefsXml, 'SellerProfileOptedIn') ?? '-'}`);
for (const p of all(prefsXml, 'SupportedSellerProfile')) {
  console.log(`  ${(one(p, 'ProfileType') ?? '').padEnd(18)} ${(one(p, 'ProfileID') ?? '').padEnd(14)} ${one(p, 'ProfileName')}`);
}

// 3. Category suggestion for a real SPARE part
console.log(`\n=== 3. Category suggestions for ${SKU} ===`);
const groups = groupPartsBySku(await getAllParts());
const group = groups.find((g) => g.sku.toUpperCase() === SKU.toUpperCase());
if (!group) throw new Error(`No SPARE part ${SKU}`);
const draft = composeDraft(group, env.publicBaseUrl ?? 'https://calfracusebayinventoryapp.onrender.com');
if (!draft) throw new Error(`${SKU} is not ready to list (needs photos, a counted quantity and a condition).`);
console.log(`  Title from SPARE: ${draft.title}`);
// GetSuggestedCategories is legacy and answers empty; Taxonomy is its replacement and
// takes an application token rather than the user's.
async function appToken(): Promise<string> {
  const res = await fetch(`${ebayBaseUrl()}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.ebayClientId}:${env.ebayClientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' }),
  });
  const json = (await res.json()) as { access_token?: string; error_description?: string };
  if (!json.access_token) throw new Error(`App token failed: ${json.error_description}`);
  return json.access_token;
}
const appTok = await appToken();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const taxo = async (p: string): Promise<any> => {
  const r = await fetch(`${ebayBaseUrl()}/commerce/taxonomy/v1/${p}`, { headers: { Authorization: `Bearer ${appTok}` } });
  const body = await r.json();
  if (!r.ok) console.log(`  Taxonomy ${p.split('?')[0]} -> HTTP ${r.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
};
const treeId: string = (await taxo('get_default_category_tree_id?marketplace_id=EBAY_MOTORS_US')).categoryTreeId ?? '100';
console.log(`  eBay Motors category tree: ${treeId}`);
const sug = await taxo(`category_tree/${treeId}/get_category_suggestions?q=${encodeURIComponent(draft.title)}`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const suggestions: { id: string; path: string }[] = (sug.categorySuggestions ?? []).map((x: any) => ({
  id: x.category.categoryId,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  path: [...(x.categoryTreeNodeAncestors ?? []).map((a: any) => a.categoryName).reverse(), x.category.categoryName].join(' > '),
}));
for (const x of suggestions.slice(0, 5)) console.log(`  ${x.id.padEnd(8)} ${x.path}`);

// 4. VerifyAddItem — validated and priced, not listed
console.log(`\n=== 4. VerifyAddItem for ${SKU} (nothing is listed) ===`);
const categoryId = suggestions[0]?.id ?? one(category, 'CategoryID');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const aspects: any[] = (await taxo(`category_tree/${treeId}/get_item_aspects_for_category?category_id=${categoryId}`)).aspects ?? [];
console.log(`  Required specifics   : ${aspects.filter((a) => a.aspectConstraint?.aspectRequired).map((a) => a.localizedAspectName).join(', ') || 'none'}`);
console.log(`  Recommended specifics: ${aspects.filter((a) => !a.aspectConstraint?.aspectRequired && a.aspectConstraint?.aspectUsage === 'RECOMMENDED').map((a) => a.localizedAspectName).slice(0, 12).join(', ')}`);
const conditionId = { NEW: '1000', LIKE_NEW: '3000', USED_EXCELLENT: '3000', USED_VERY_GOOD: '3000', USED_GOOD: '3000', USED_ACCEPTABLE: '3000', FOR_PARTS_OR_NOT_WORKING: '7000' }[draft.condition];
const price = draft.price ?? 49.99;
const specificXml = [
  ['Brand', draft.brand ?? 'Unbranded'],
  ['Manufacturer Part Number', draft.mpn],
]
  .map(([n, v]) => `<NameValueList><Name>${esc(n)}</Name><Value>${esc(v)}</Value></NameValueList>`)
  .join('');
const policyXml = profiles
  ? `<SellerProfiles>
      <SellerShippingProfile><ShippingProfileID>${one(shipProfile, 'ShippingProfileID')}</ShippingProfileID></SellerShippingProfile>
      <SellerReturnProfile><ReturnProfileID>${one(returnProfile, 'ReturnProfileID')}</ReturnProfileID></SellerReturnProfile>
      <SellerPaymentProfile><PaymentProfileID>${one(payProfile, 'PaymentProfileID')}</PaymentProfileID></SellerPaymentProfile>
    </SellerProfiles>`
  : `<DispatchTimeMax>${one(item, 'DispatchTimeMax') ?? '2'}</DispatchTimeMax>`;
console.log(`  Category ${categoryId}, condition ${conditionId}, qty ${draft.quantity}, ${draft.imageUrls.length} photos, price ${draft.price != null ? `$${price}` : `$${price} (placeholder - no price on file)`}`);
const verifyXml = await trading(
  'VerifyAddItem',
  `<Item>
    <Title>${esc(draft.title)}</Title>
    <Description><![CDATA[${draft.descriptionHtml}]]></Description>
    <PrimaryCategory><CategoryID>${categoryId}</CategoryID></PrimaryCategory>
    <ConditionID>${conditionId}</ConditionID>
    <ItemSpecifics>${specificXml}</ItemSpecifics>
    <PictureDetails>${draft.imageUrls.slice(0, 12).map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('')}</PictureDetails>
    <StartPrice currencyID="USD">${price.toFixed(2)}</StartPrice>
    <Quantity>${draft.quantity}</Quantity>
    <SKU>${esc(draft.sku)}</SKU>
    <ListingType>FixedPriceItem</ListingType>
    <ListingDuration>GTC</ListingDuration>
    <Country>${one(item, 'Country') ?? 'US'}</Country>
    <Currency>USD</Currency>
    <Location>${esc(one(item, 'Location') ?? '')}</Location>
    <PostalCode>${esc(POSTAL_OVERRIDE ?? one(item, 'PostalCode') ?? '')}</PostalCode>
    ${pkg ? `<ShippingPackageDetails>${pkg}</ShippingPackageDetails>` : ''}
    ${policyXml}
  </Item>`,
  '100'
);
report('VerifyAddItem', verifyXml);
const fees = all(verifyXml, 'Fee')
  .map((f) => ({ name: one(f, 'Name'), amount: Number(one(f, 'Fee') ?? 0) }))
  .filter((f) => f.amount > 0);
console.log(`  Upfront fees: ${fees.length ? fees.map((f) => `${f.name} $${f.amount.toFixed(2)}`).join(', ') : 'none'}`);
for (const r of all(verifyXml, 'Recommendation').slice(0, 5)) console.log(`  Recommendation: ${one(r, 'Name')} ${one(r, 'Value') ?? ''}`);
console.log('');
