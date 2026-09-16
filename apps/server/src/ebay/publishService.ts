import type {
  AgentListing,
  CategoryInfo,
  ListingFee,
  PolicyChoice,
  SellerPolicy,
  SellerSetup,
  ShipFrom,
  TradingMessage,
} from '@warehouse/shared';
import { getListings } from '../google/sheetsService.js';
import { ebayBaseUrl, getAppAccessToken } from './client.js';
import {
  SITE_MOTORS,
  SITE_US,
  tradingCall,
  tradingMessages,
  tradingSucceeded,
  xmlAll,
  xmlDecode,
  xmlEscape,
  xmlOne,
} from './trading.js';

/**
 * Publishing a researched listing through the Trading API.
 *
 * Everything the team already decided once — business policies, where parts ship from —
 * is read off their live listings rather than configured, so a listing made here goes out
 * the way the last one made in Seller Hub did.
 */

export interface PublishInput {
  listing: AgentListing;
  sku: string;
  quantity: number;
  conditionId: string;
  imageUrls: string[];
  policies: PolicyChoice;
  shipFrom: ShipFrom;
}

export class ListingRejectedError extends Error {
  messages: TradingMessage[];
  constructor(messages: TradingMessage[]) {
    super('eBay rejected the listing.');
    this.messages = messages;
  }
}

const SETUP_TTL_MS = 10 * 60_000;
let setupCache: { at: number; value: SellerSetup } | undefined;

export async function getSellerSetup(): Promise<SellerSetup> {
  if (setupCache && Date.now() - setupCache.at < SETUP_TTL_MS) return setupCache.value;

  const prefs = await tradingCall('GetUserPreferences', '<ShowSellerProfilePreferences>true</ShowSellerProfilePreferences>');
  if (!tradingSucceeded(prefs)) {
    throw new Error(`Couldn't read business policies: ${tradingMessages(prefs).map((m) => m.message).join(' ')}`);
  }

  const shipping: SellerPolicy[] = [];
  const returns: SellerPolicy[] = [];
  const payment: SellerPolicy[] = [];
  for (const p of xmlAll(prefs, 'SupportedSellerProfile')) {
    const policy = { id: xmlOne(p, 'ProfileID') ?? '', name: xmlDecode(xmlOne(p, 'ProfileName') ?? '') };
    if (!policy.id) continue;
    const type = xmlOne(p, 'ProfileType');
    if (type === 'SHIPPING') shipping.push(policy);
    else if (type === 'RETURN_POLICY') returns.push(policy);
    else if (type === 'PAYMENT') payment.push(policy);
  }

  const setup: SellerSetup = { shipping, returns, payment, defaults: {}, shipFrom: null };

  // Newest first: they show how the team lists now. The oldest listings predate the
  // business policies and carry shipping and returns inline, so they have none to copy.
  // Item IDs rise over time, so the longest-then-largest ID is the most recent.
  const listings = (await getListings().catch(() => [])).sort(
    (a, b) => b.ebayListingId.length - a.ebayListingId.length || b.ebayListingId.localeCompare(a.ebayListingId)
  );
  for (const l of listings.slice(0, 5)) {
    const xml = await tradingCall(
      'GetItem',
      `<ItemID>${xmlEscape(l.ebayListingId)}</ItemID><DetailLevel>ReturnAll</DetailLevel>`
    );
    if (!tradingSucceeded(xml)) continue;
    const item = xmlOne(xml, 'Item') ?? '';
    const profiles = xmlOne(item, 'SellerProfiles');
    if (profiles && !setup.defaults.shipping) {
      setup.defaults = {
        shipping: xmlOne(xmlOne(profiles, 'SellerShippingProfile'), 'ShippingProfileID'),
        returns: xmlOne(xmlOne(profiles, 'SellerReturnProfile'), 'ReturnProfileID'),
        payment: xmlOne(xmlOne(profiles, 'SellerPaymentProfile'), 'PaymentProfileID'),
      };
    }
    const postalCode = xmlOne(item, 'PostalCode');
    if (postalCode && !setup.shipFrom) {
      setup.shipFrom = {
        location: xmlDecode(xmlOne(item, 'Location') ?? ''),
        postalCode,
        country: xmlOne(item, 'Country') ?? 'US',
      };
    }
    if (setup.defaults.shipping && setup.shipFrom) break;
  }

  setupCache = { at: Date.now(), value: setup };
  return setup;
}

interface TaxonomyAspect {
  localizedAspectName: string;
  aspectConstraint?: { aspectRequired?: boolean; aspectUsage?: string };
}
interface TaxonomySubtree {
  categorySubtreeNode?: { category: { categoryId: string; categoryName: string }; leafCategoryTreeNode?: boolean };
}

async function taxonomy<T>(path: string): Promise<T | null> {
  const token = await getAppAccessToken();
  const res = await fetch(`${ebayBaseUrl()}/commerce/taxonomy/v1/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`eBay Taxonomy failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

// Motors first: the team lists truck parts, and the agent is asked for Motors categories.
const TREES = [
  { tree: '100', siteId: SITE_MOTORS },
  { tree: '0', siteId: SITE_US },
];
const categoryCache = new Map<string, CategoryInfo | null>();

export async function resolveCategory(categoryId: string): Promise<CategoryInfo | null> {
  if (!/^\d+$/.test(categoryId)) return null;
  if (categoryCache.has(categoryId)) return categoryCache.get(categoryId)!;

  for (const { tree, siteId } of TREES) {
    const subtree = await taxonomy<TaxonomySubtree>(`category_tree/${tree}/get_category_subtree?category_id=${categoryId}`);
    const node = subtree?.categorySubtreeNode;
    if (!node) continue;
    const leaf = !!node.leafCategoryTreeNode;
    const aspects = leaf
      ? ((await taxonomy<{ aspects?: TaxonomyAspect[] }>(
          `category_tree/${tree}/get_item_aspects_for_category?category_id=${categoryId}`
        ))?.aspects ?? [])
      : [];
    const info: CategoryInfo = {
      id: categoryId,
      name: node.category.categoryName,
      leaf,
      siteId,
      required: aspects.filter((a) => a.aspectConstraint?.aspectRequired).map((a) => a.localizedAspectName),
      recommended: aspects
        .filter((a) => !a.aspectConstraint?.aspectRequired && a.aspectConstraint?.aspectUsage === 'RECOMMENDED')
        .map((a) => a.localizedAspectName),
    };
    categoryCache.set(categoryId, info);
    return info;
  }
  categoryCache.set(categoryId, null);
  return null;
}

function itemXml(input: PublishInput): string {
  const l = input.listing;
  const specifics = l.specifics
    .map(
      (s) =>
        `<NameValueList><Name>${xmlEscape(s.name)}</Name>${s.values.map((v) => `<Value>${xmlEscape(v)}</Value>`).join('')}</NameValueList>`
    )
    .join('');
  // Rounded up: carriers bill whole inches and ounces, and an undercharge comes out of the sale.
  const ounces = Math.ceil((l.weightLb ?? 0) * 16 + (l.weightOz ?? 0));
  const inches = (v: number | null) => Math.ceil(v ?? 0);

  return `<Item>
<Title>${xmlEscape(l.title)}</Title>
<Description><![CDATA[${l.descriptionHtml.replace(/]]>/g, ']]]]><![CDATA[>')}]]></Description>
<PrimaryCategory><CategoryID>${xmlEscape(l.categoryId)}</CategoryID></PrimaryCategory>
<ConditionID>${input.conditionId}</ConditionID>
<ItemSpecifics>${specifics}</ItemSpecifics>
<PictureDetails>${input.imageUrls.map((u) => `<PictureURL>${xmlEscape(u)}</PictureURL>`).join('')}</PictureDetails>
<StartPrice currencyID="USD">${(l.price ?? 0).toFixed(2)}</StartPrice>
<BestOfferDetails><BestOfferEnabled>${l.bestOffer}</BestOfferEnabled></BestOfferDetails>
<Quantity>${input.quantity}</Quantity>
<SKU>${xmlEscape(input.sku)}</SKU>
<ListingType>FixedPriceItem</ListingType>
<ListingDuration>GTC</ListingDuration>
<Country>${xmlEscape(input.shipFrom.country)}</Country>
<Currency>USD</Currency>
<Location>${xmlEscape(input.shipFrom.location)}</Location>
<PostalCode>${xmlEscape(input.shipFrom.postalCode)}</PostalCode>
<ShippingPackageDetails>
<MeasurementUnit>English</MeasurementUnit>
<PackageDepth unit="inches">${inches(l.heightIn)}</PackageDepth>
<PackageLength unit="inches">${inches(l.lengthIn)}</PackageLength>
<PackageWidth unit="inches">${inches(l.widthIn)}</PackageWidth>
<ShippingPackage>PackageThickEnvelope</ShippingPackage>
<WeightMajor unit="lbs">${Math.floor(ounces / 16)}</WeightMajor>
<WeightMinor unit="oz">${ounces % 16}</WeightMinor>
</ShippingPackageDetails>
<SellerProfiles>
<SellerShippingProfile><ShippingProfileID>${xmlEscape(input.policies.shipping)}</ShippingProfileID></SellerShippingProfile>
<SellerReturnProfile><ReturnProfileID>${xmlEscape(input.policies.returns)}</ReturnProfileID></SellerReturnProfile>
<SellerPaymentProfile><PaymentProfileID>${xmlEscape(input.policies.payment)}</PaymentProfileID></SellerPaymentProfile>
</SellerProfiles>
</Item>`;
}

function feesFrom(xml: string): ListingFee[] {
  return xmlAll(xmlOne(xml, 'Fees'), 'Fee')
    .map((f) => ({ name: xmlOne(f, 'Name') ?? '', amount: Number(xmlOne(f, 'Fee') ?? 0) }))
    .filter((f) => f.amount > 0);
}

export interface VerifyOutcome {
  ok: boolean;
  messages: TradingMessage[];
  fees: ListingFee[];
  category: CategoryInfo | null;
  missingSpecifics: string[];
}

/** eBay's full validation of the listing, with its fees. Lists nothing. */
export async function verifyListing(input: PublishInput): Promise<VerifyOutcome> {
  const messages: TradingMessage[] = [];
  const id = input.listing.categoryId;
  const category = id ? await resolveCategory(id) : null;

  if (id && !category) {
    messages.push({ severity: 'error', code: 'category', message: `eBay has no category ${id} in eBay Motors or eBay US.` });
  } else if (category && !category.leaf) {
    messages.push({
      severity: 'error',
      code: 'category',
      message: `"${category.name}" has sub-categories — eBay only lists in the most specific one.`,
    });
  }
  const missingSpecifics = (category?.required ?? []).filter(
    (name) => !input.listing.specifics.some((s) => s.name.toLowerCase() === name.toLowerCase())
  );

  const xml = await tradingCall('VerifyAddItem', itemXml(input), category?.siteId ?? SITE_MOTORS);
  messages.push(...tradingMessages(xml));

  return {
    ok: tradingSucceeded(xml) && !messages.some((m) => m.severity === 'error') && missingSpecifics.length === 0,
    messages,
    fees: feesFrom(xml),
    category,
    missingSpecifics,
  };
}

/** Puts the listing live. Throws ListingRejectedError with eBay's reasons if it refuses. */
export async function publishListing(
  input: PublishInput
): Promise<{ itemId: string; url: string; fees: ListingFee[]; messages: TradingMessage[] }> {
  const category = await resolveCategory(input.listing.categoryId);
  const xml = await tradingCall('AddItem', itemXml(input), category?.siteId ?? SITE_MOTORS);
  const messages = tradingMessages(xml);
  const itemId = xmlOne(xml, 'ItemID');
  if (!tradingSucceeded(xml) || !itemId) throw new ListingRejectedError(messages);
  return { itemId, url: `https://www.ebay.com/itm/${itemId}`, fees: feesFrom(xml), messages };
}
