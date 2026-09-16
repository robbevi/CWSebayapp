import type { PartGroup } from './grouping.js';
import { MAX_TITLE } from './draft.js';

/**
 * A listing researched by the Copilot agent and pasted into SPARE.
 *
 * The split of responsibility is deliberate. The agent researches what it is good at —
 * title, category, price, description, item specifics, and an estimate of the packed size
 * — while SPARE supplies what it knows first-hand and the agent could only guess: the
 * photographs, the counted quantity, the inspected condition, and the part number.
 */
export interface AgentListing {
  title: string;
  categoryId: string;
  categoryName?: string;
  price: number | null;
  bestOffer: boolean;
  descriptionHtml: string;
  specifics: ItemSpecific[];
  /** Packed weight. The agent estimates it; a person can correct it before publishing. */
  weightLb: number | null;
  weightOz: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
}

export interface ItemSpecific {
  name: string;
  values: string[];
}

export interface AgentParseResult {
  listing: AgentListing | null;
  error?: string;
  /** Things filled in or assumed while reading, worth a person knowing about. */
  notes: string[];
}

/** eBay's Trading API condition IDs, for the conditions SPARE records. */
const TRADING_CONDITIONS: Record<string, { id: string; label: string }> = {
  New: { id: '1000', label: 'New' },
  'Like New': { id: '3000', label: 'Used' },
  Good: { id: '3000', label: 'Used' },
  Fair: { id: '3000', label: 'Used' },
  // Deliberately conservative, as in draft.ts: Poor is likelier to disappoint than delight.
  Poor: { id: '7000', label: 'For parts or not working' },
  'For Parts': { id: '7000', label: 'For parts or not working' },
};

export function tradingCondition(itemCondition: string | undefined): { id: string; label: string } | null {
  if (!itemCondition) return null;
  return TRADING_CONDITIONS[itemCondition.trim()] ?? null;
}

const usableBrand = (manufacturer: string | undefined) => {
  const m = manufacturer?.trim();
  return m && !/^not available$/i.test(m) ? m : null;
};

/**
 * What a person copies into the agent. The part's confirmed facts travel with it so the
 * research starts from what was actually on the shelf, and the reply shape is spelled out
 * so pasting it back needs no tidying. Field rules sit outside the JSON: comments inside
 * would be copied into the answer and make it invalid.
 */
export function agentPrompt(group: PartGroup): string {
  const qty = group.confirmedQoh ?? group.stockQty;
  const facts = [
    `Part number (SKU): ${group.sku}`,
    `Description on file: ${group.description || '(none)'}`,
    `Manufacturer on file: ${usableBrand(group.manufacturer) ?? '(unknown)'}`,
    `Condition (inspected): ${group.itemCondition ?? '(not recorded)'}${group.boxCondition ? `, packaging: ${group.boxCondition}` : ''}`,
    `Quantity available: ${qty}`,
    group.records.find((r) => r.notes?.trim())?.notes?.trim()
      ? `Warehouse notes: ${group.records.find((r) => r.notes?.trim())!.notes!.trim()}`
      : null,
  ].filter(Boolean);

  return [
    'Prepare an eBay listing for this surplus part. Research it, then reply with ONLY a JSON object in exactly this shape and nothing else:',
    '',
    '{',
    '  "title": "",',
    '  "categoryId": "",',
    '  "categoryName": "",',
    '  "price": 0,',
    '  "bestOffer": true,',
    '  "description": "",',
    '  "itemSpecifics": { "Brand": "", "Manufacturer Part Number": "", "Type": "" },',
    '  "weightLb": 0,',
    '  "weightOz": 0,',
    '  "lengthIn": 0,',
    '  "widthIn": 0,',
    '  "heightIn": 0',
    '}',
    '',
    'Rules:',
    `- title: at most ${MAX_TITLE} characters, the words a buyer would search for first.`,
    '- categoryId: the numeric eBay leaf category ID (eBay Motors Parts & Accessories where it fits).',
    '- price: US dollars, a number, what it should realistically sell for.',
    '- description: HTML. Describe the part, what it fits, and its condition. Do not mention quantities or shipping.',
    "- itemSpecifics: every specific eBay requires for the category, plus any that help buyers find it.",
    '- weight and dimensions: your best estimate of the part packed for shipping, in pounds/ounces and inches.',
    '',
    'Confirmed facts from the warehouse — do not contradict these:',
    ...facts.map((f) => `- ${f}`),
  ].join('\n');
}

const keyOf = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

const ALIASES: Record<keyof AgentListing | 'dimensions' | 'weight', string[]> = {
  title: ['title', 'listingtitle'],
  categoryId: ['categoryid', 'ebaycategoryid', 'category', 'categorynumber', 'primarycategory'],
  categoryName: ['categoryname', 'categorypath'],
  price: ['price', 'startprice', 'listprice', 'buyitnowprice', 'suggestedprice', 'listingprice'],
  bestOffer: ['bestoffer', 'bestofferenabled', 'acceptoffers', 'allowoffers'],
  descriptionHtml: ['description', 'descriptionhtml', 'htmldescription', 'listingdescription'],
  specifics: ['itemspecifics', 'specifics', 'aspects', 'itemaspects'],
  weightLb: ['weightlb', 'weightlbs', 'weightpounds', 'pounds', 'lbs'],
  weightOz: ['weightoz', 'weightounces', 'ounces', 'oz'],
  weight: ['weight', 'packageweight', 'shippingweight'],
  lengthIn: ['lengthin', 'length', 'packagelength'],
  widthIn: ['widthin', 'width', 'packagewidth'],
  heightIn: ['heightin', 'height', 'depthin', 'depth', 'packageheight', 'packagedepth'],
  dimensions: ['dimensions', 'packagedimensions', 'boxsize', 'packagesize', 'size'],
};

/** Nested objects agents tend to group package details under. Flattened one level. */
const NESTED = new Set(['package', 'shipping', 'packagedetails', 'shippingpackage', 'shippingdetails', 'packaging']);

function flatten(obj: Record<string, unknown>): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) {
    const key = keyOf(k);
    if (NESTED.has(key) && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [ik, iv] of Object.entries(v as Record<string, unknown>)) {
        if (!out.has(keyOf(ik))) out.set(keyOf(ik), iv);
      }
    } else {
      out.set(key, v);
    }
  }
  return out;
}

function pick(map: Map<string, unknown>, field: keyof typeof ALIASES): unknown {
  for (const alias of ALIASES[field]) if (map.has(alias)) return map.get(alias);
  return undefined;
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const m = /-?\d+(?:\.\d+)?/.exec(v.replace(/,/g, ''));
  return m ? Number(m[0]) : null;
}

/** "4 lb 8 oz", "4.5 lbs", "12 oz", 4.5 → pounds and ounces. */
export function parseWeight(v: unknown): { lb: number; oz: number } | null {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const lb = /(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound)/i.exec(v);
    const oz = /(\d+(?:\.\d+)?)\s*(?:oz|ounce)/i.exec(v);
    if (lb || oz) return splitPounds(Number(lb?.[1] ?? 0), Number(oz?.[1] ?? 0));
  }
  const n = toNumber(v);
  return n == null ? null : splitPounds(n, 0);
}

function splitPounds(lb: number, oz: number): { lb: number; oz: number } {
  const totalOz = Math.round(lb * 16 + oz);
  return { lb: Math.floor(totalOz / 16), oz: totalOz % 16 };
}

/** "8 x 6 x 4 in", "8×6×4", {length, width, height} → inches. */
export function parseDimensions(v: unknown): { l: number; w: number; h: number } | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const m = flatten(v as Record<string, unknown>);
    const l = toNumber(pick(m, 'lengthIn'));
    const w = toNumber(pick(m, 'widthIn'));
    const h = toNumber(pick(m, 'heightIn'));
    return l != null && w != null && h != null ? { l, w, h } : null;
  }
  if (typeof v !== 'string') return null;
  const m = /(\d+(?:\.\d+)?)\s*(?:in|")?\s*(?:x|×|\*|by)\s*(\d+(?:\.\d+)?)\s*(?:in|")?\s*(?:x|×|\*|by)\s*(\d+(?:\.\d+)?)/i.exec(v);
  return m ? { l: Number(m[1]), w: Number(m[2]), h: Number(m[3]) } : null;
}

function toSpecifics(v: unknown): ItemSpecific[] {
  const raw: ItemSpecific[] = [];
  const values = (x: unknown): string[] =>
    (Array.isArray(x) ? x : [x])
      .map((y) => (y == null ? '' : String(y).trim()))
      .filter(Boolean);

  if (Array.isArray(v)) {
    for (const item of v) {
      if (!item || typeof item !== 'object') continue;
      const m = flatten(item as Record<string, unknown>);
      const name = String(m.get('name') ?? m.get('aspect') ?? '').trim();
      if (name) raw.push({ name, values: values(m.get('values') ?? m.get('value')) });
    }
  } else if (v && typeof v === 'object') {
    for (const [name, value] of Object.entries(v as Record<string, unknown>)) {
      raw.push({ name: name.trim(), values: values(value) });
    }
  }

  const seen = new Set<string>();
  return raw.filter((s) => {
    const k = s.name.toLowerCase();
    if (!s.name || !s.values.length || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Real tags only: part descriptions carry things like <1/2" NPT>, which are text.
const HTML_TAG = /<\/?(?:p|br|ul|ol|li|h[1-6]|div|span|strong|b|i|em|u|table|thead|tbody|tr|td|th|img|a|hr)\b[^>]*>/i;

/** Plain text becomes paragraphs; anything already marked up is left alone. */
function toHtml(text: string): string {
  if (HTML_TAG.test(text)) return text.trim();
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function extractJson(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start !== -1 && end > start ? body.slice(start, end + 1) : null;
}

/**
 * Reads whatever the agent said back. Forgiving about shape — agents rename keys, wrap
 * JSON in prose or code fences, and write prices as "$1,299.00" — and strict only about
 * the answer being JSON at all, since guessing at free text would publish nonsense.
 */
export function parseAgentOutput(text: string): AgentParseResult {
  const notes: string[] = [];
  const json = extractJson(text ?? '');
  if (!json) return { listing: null, notes, error: "Couldn't find a JSON object in the agent's answer." };

  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch (err) {
    return {
      listing: null,
      notes,
      error: `The agent's answer isn't valid JSON (${err instanceof Error ? err.message : 'parse error'}). Ask it to reply with only the JSON object.`,
    };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { listing: null, notes, error: "The agent's answer isn't a JSON object." };
  }

  const m = flatten(obj as Record<string, unknown>);
  const str = (v: unknown) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

  let weightLb = toNumber(pick(m, 'weightLb'));
  let weightOz = toNumber(pick(m, 'weightOz'));
  if (weightLb == null && weightOz == null) {
    const w = parseWeight(pick(m, 'weight'));
    if (w) ({ lb: weightLb, oz: weightOz } = w);
  } else if (weightLb != null && !Number.isInteger(weightLb)) {
    const w = splitPounds(weightLb, weightOz ?? 0);
    weightLb = w.lb;
    weightOz = w.oz;
  }

  let lengthIn = toNumber(pick(m, 'lengthIn'));
  let widthIn = toNumber(pick(m, 'widthIn'));
  let heightIn = toNumber(pick(m, 'heightIn'));
  if (lengthIn == null || widthIn == null || heightIn == null) {
    const d = parseDimensions(pick(m, 'dimensions'));
    if (d) ({ l: lengthIn, w: widthIn, h: heightIn } = d);
  }

  const rawBestOffer = pick(m, 'bestOffer');
  let bestOffer = true;
  if (rawBestOffer === undefined) {
    notes.push('Best Offer is on, as on your current listings.');
  } else {
    bestOffer = rawBestOffer === true || /^(true|yes|y|1|on)$/i.test(String(rawBestOffer));
  }

  const rawCategory = pick(m, 'categoryId');
  const categoryId = /\d{3,}/.exec(str(rawCategory))?.[0] ?? '';
  const rawCategoryName = pick(m, 'categoryName');
  const categoryName =
    str(rawCategoryName) ||
    (typeof rawCategory === 'string' && /[a-z]/i.test(rawCategory) ? str(rawCategory.replace(/\d{3,}/, '')).replace(/^[-–—:\s]+/, '') : '');

  const listing: AgentListing = {
    title: str(pick(m, 'title')),
    categoryId,
    categoryName: categoryName || undefined,
    price: toNumber(pick(m, 'price')),
    bestOffer,
    descriptionHtml: toHtml(String(pick(m, 'descriptionHtml') ?? '')),
    specifics: toSpecifics(pick(m, 'specifics')),
    weightLb,
    weightOz,
    lengthIn,
    widthIn,
    heightIn,
  };
  return { listing, notes };
}

/** Fills what SPARE knows and the agent may have left out. Never overrides the agent. */
export function fillFromPart(listing: AgentListing, group: PartGroup): AgentListing {
  const specifics = [...listing.specifics];
  const has = (name: string) => specifics.some((s) => s.name.toLowerCase() === name.toLowerCase());
  if (!has('Brand')) specifics.push({ name: 'Brand', values: [usableBrand(group.manufacturer) ?? 'Unbranded'] });
  if (!has('Manufacturer Part Number')) specifics.push({ name: 'Manufacturer Part Number', values: [group.sku] });
  return { ...listing, specifics };
}

/** Problems worth stopping for before eBay is asked. eBay's own check follows. */
export function listingProblems(listing: AgentListing): string[] {
  const problems: string[] = [];
  if (!listing.title) problems.push('Title is missing.');
  else if (listing.title.length > MAX_TITLE)
    problems.push(`Title is ${listing.title.length} characters; eBay allows ${MAX_TITLE}.`);
  if (!listing.categoryId) problems.push('Category ID is missing.');
  if (listing.price == null || listing.price <= 0) problems.push('Price is missing.');
  if (!listing.descriptionHtml.replace(/<[^>]+>/g, '').trim()) problems.push('Description is missing.');
  if ((listing.weightLb ?? 0) * 16 + (listing.weightOz ?? 0) <= 0) problems.push('Package weight is missing.');
  if (![listing.lengthIn, listing.widthIn, listing.heightIn].every((d) => d != null && d > 0))
    problems.push('Package dimensions are missing.');
  return problems;
}

/**
 * Rebuilds a listing received over the wire into the shape the server trusts, so a
 * malformed request can only ever produce a listing that fails its checks.
 */
export function coerceAgentListing(input: unknown): AgentListing {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  const n = (v: unknown) => {
    if (v === null || v === undefined || v === '') return null;
    const k = Number(v);
    return Number.isFinite(k) ? k : null;
  };
  const specifics = Array.isArray(o.specifics)
    ? (o.specifics as unknown[]).flatMap((sp) => {
        if (!sp || typeof sp !== 'object') return [];
        const r = sp as Record<string, unknown>;
        const name = s(r.name).trim();
        const values = (Array.isArray(r.values) ? r.values : [r.values]).map((v) => s(v).trim()).filter(Boolean);
        return name && values.length ? [{ name, values }] : [];
      })
    : [];
  return {
    title: s(o.title).replace(/\s+/g, ' ').trim(),
    categoryId: s(o.categoryId).trim(),
    categoryName: o.categoryName ? s(o.categoryName) : undefined,
    price: n(o.price),
    bestOffer: o.bestOffer !== false,
    descriptionHtml: s(o.descriptionHtml),
    specifics,
    weightLb: n(o.weightLb),
    weightOz: n(o.weightOz),
    lengthIn: n(o.lengthIn),
    widthIn: n(o.widthIn),
    heightIn: n(o.heightIn),
  };
}

// What the server says back about a listing.

export interface SellerPolicy {
  id: string;
  name: string;
}

export interface ShipFrom {
  location: string;
  postalCode: string;
  country: string;
}

export interface PolicyChoice {
  shipping: string;
  returns: string;
  payment: string;
}

export interface SellerSetup {
  shipping: SellerPolicy[];
  returns: SellerPolicy[];
  payment: SellerPolicy[];
  /** The policies on the team's current listings, so a new one goes out the same way. */
  defaults: Partial<PolicyChoice>;
  shipFrom: ShipFrom | null;
}

export interface TradingMessage {
  /** `info` is eBay's account-wide boilerplate, which says nothing about this listing. */
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
}

export interface ListingFee {
  name: string;
  amount: number;
}

export interface CategoryInfo {
  id: string;
  name: string;
  /** eBay only lists in leaf categories. */
  leaf: boolean;
  siteId: string;
  required: string[];
  recommended: string[];
}

export interface ListingCheck {
  ok: boolean;
  problems: string[];
  messages: TradingMessage[];
  fees: ListingFee[];
  category: CategoryInfo | null;
  missingSpecifics: string[];
  preview: { quantity: number; condition: string; photoCount: number; shipFrom: ShipFrom };
}

export interface PublishResult {
  itemId: string;
  url: string;
  fees: ListingFee[];
  messages: TradingMessage[];
  /** False when eBay listed it but writing the listing ID back to the sheet failed. */
  recorded: boolean;
  note?: string;
}

export interface ListingRequest {
  listing: AgentListing;
  policies: PolicyChoice;
  submittedBy?: string;
}
