import type { PartGroup } from './grouping.js';
import { MAX_TITLE } from './draft.js';

/**
 * A listing researched by the Copilot agent ("eBay Parts Researcher") and pasted into SPARE.
 *
 * The split of responsibility is deliberate. The agent researches what it is good at —
 * titles, category, price, description, item specifics, and an estimate of the packed size
 * — while SPARE supplies what it knows first-hand and the agent could only guess: the
 * photographs, the counted quantity, the inspected condition, and the part number.
 *
 * The agent writes a six-section research package for people. SPARE's prompt asks it to
 * finish with a seventh, "SPARE Import": the same findings as one JSON block. The request
 * travels in the prompt rather than the agent's own instructions, which are within a few
 * hundred characters of Agent Builder's 8,000-character limit.
 */
export interface AgentListing {
  /** The SKU the agent says it researched, checked against the part being listed. */
  researchedSku?: string;
  title: string;
  /** The agent's recommended title and its alternatives, recommended first. */
  titleOptions: string[];
  categoryId: string;
  categoryName?: string;
  /** The agent gives a category path, not an ID; SPARE finds the ID from it. */
  categoryPath?: string;
  alternateCategoryPath?: string;
  price: number | null;
  /** The agent's quick-sale, target and max-value prices. */
  priceOptions: PriceOption[];
  priceConfidence?: string;
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

export interface PriceOption {
  label: string;
  amount: number;
}

export interface AgentParseResult {
  listing: AgentListing | null;
  error?: string;
  /** Things filled in or assumed while reading, worth a person knowing about. */
  notes: string[];
}

/** eBay caps item specific names and values at 65 characters each. */
export const MAX_SPECIFIC = 65;

/**
 * eBay's Trading API condition IDs, for the conditions SPARE records.
 *
 * The warehouse grades how a part looks, not whether it was used: almost all of this stock
 * is new surplus, and "Good" or "Like New" means new with shelf dust or a tired box. Those
 * list as New — the agent's standard Condition statement already covers packaging wear.
 * "Fair" and below are where a part itself is in question.
 */
const TRADING_CONDITIONS: Record<string, { id: string; label: string }> = {
  New: { id: '1000', label: 'New' },
  'Like New': { id: '1000', label: 'New' },
  Good: { id: '1000', label: 'New' },
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

const SPARE_IMPORT_TEMPLATE = [
  '{',
  '  "sku": "",',
  '  "title": "",',
  '  "alternateTitles": ["", "", ""],',
  '  "categoryPath": "",',
  '  "categoryId": "",',
  '  "prices": { "quickSale": 0, "target": 0, "max": 0 },',
  '  "priceConfidence": "",',
  '  "itemSpecifics": { "Brand": "", "Manufacturer Part Number": "" },',
  '  "package": { "weightLb": 0, "weightOz": 0, "lengthIn": 0, "widthIn": 0, "heightIn": 0 },',
  '  "descriptionHtml": ""',
  '}',
];

/**
 * What a person copies into the agent: the part's confirmed facts, and the request for the
 * SPARE Import section. The agent still writes its usual package — people read that — and
 * the JSON at the end is what SPARE reads.
 */
export function agentPrompt(group: PartGroup): string {
  const qty = group.confirmedQoh ?? group.stockQty;
  const notes = group.records.find((r) => r.notes?.trim())?.notes?.trim();
  const condition = group.itemCondition?.trim();
  const listsAsNew = tradingCondition(condition)?.id === '1000';
  const facts = [
    `SKU: ${group.sku}`,
    `Description: ${group.description || 'Not Available'}`,
    `Manufacturer: ${usableBrand(group.manufacturer) ?? 'Not Available'}`,
    `Condition (inspected): ${condition ?? 'not recorded'}${group.boxCondition ? `, packaging: ${group.boxCondition}` : ''}`,
    `Quantity available: ${qty}`,
    notes ? `Warehouse notes: ${notes}` : null,
  ].filter(Boolean);

  return [
    'Research this part and produce your full listing package (sections 1–6) as usual.',
    '',
    ...facts.map((f) => `- ${f}`),
    '',
    // The agent's standard Condition statement says every item is new and unused.
    ...(condition && !listsAsNew
      ? [
          `This part was inspected as "${condition}", not new. In the Condition section, describe it as ${condition.toLowerCase()} instead of using the standard new-and-unused statement.`,
          '',
        ]
      : []),
    'Then finish with one more section, "7. SPARE Import": a single ```json code block in exactly this shape, with nothing after it.',
    '',
    '```json',
    ...SPARE_IMPORT_TEMPLATE,
    '```',
    '',
    'Section 7 rules:',
    '- sku: the SKU above, exactly.',
    '- title / alternateTitles: your recommended title and your three alternatives.',
    '- categoryPath: the eBay marketplace category path from section 4, levels separated by " > ". categoryId: the numeric eBay category ID only if you are certain of it, otherwise "".',
    '- prices: your quick-sale, target and max-value prices as plain numbers. priceConfidence: your confidence level.',
    `- itemSpecifics: the item specifics from section 3 as "Name": "Value". Leave out SKU, Condition, and anything Not Available. Keep every name and value under ${MAX_SPECIFIC} characters.`,
    '- package: your estimate of the packed shipping weight (pounds and ounces) and box size (inches), from the part type and specifications. It is used only to calculate shipping.',
    `- descriptionHtml: the complete HTML from section 2, on one line, using single quotes (') around every HTML attribute so the JSON stays valid.`,
  ].join('\n');
}

const keyOf = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

const ALIASES = {
  researchedSku: ['sku', 'calfracsku', 'sparesku'],
  title: ['title', 'recommendedtitle', 'listingtitle'],
  alternateTitles: ['alternatetitles', 'alternativetitles', 'alttitles', 'alternates'],
  titles: ['titles', 'seotitles', 'listingtitles'],
  categoryId: ['categoryid', 'ebaycategoryid', 'categorynumber'],
  category: ['category', 'primarycategory', 'ebaycategory', 'marketplacecategory', 'recommendedcategory'],
  categoryName: ['categoryname'],
  categoryPath: ['categorypath', 'marketplacecategorypath'],
  alternateCategoryPath: ['alternatecategorypath', 'alternatecategory'],
  price: ['price', 'startprice', 'listprice', 'buyitnowprice', 'suggestedprice', 'listingprice'],
  prices: ['prices', 'pricing', 'recommendedpricing', 'pricerecommendation', 'pricetiers'],
  priceConfidence: ['priceconfidence', 'confidence', 'confidencelevel'],
  bestOffer: ['bestoffer', 'bestofferenabled', 'acceptoffers', 'allowoffers'],
  descriptionHtml: ['descriptionhtml', 'description', 'htmldescription', 'listingdescription', 'html'],
  specifics: ['itemspecifics', 'specifics', 'aspects', 'itemaspects'],
  weightLb: ['weightlb', 'weightlbs', 'weightpounds', 'pounds', 'lbs'],
  weightOz: ['weightoz', 'weightounces', 'ounces', 'oz'],
  weight: ['weight', 'packageweight', 'shippingweight'],
  lengthIn: ['lengthin', 'length', 'packagelength'],
  widthIn: ['widthin', 'width', 'packagewidth'],
  heightIn: ['heightin', 'height', 'depthin', 'depth', 'packageheight', 'packagedepth'],
  dimensions: ['dimensions', 'packagedimensions', 'boxsize', 'packagesize', 'size'],
  quickSale: ['quicksale', 'quicksaleprice', 'quick', 'low'],
  target: ['target', 'targetprice', 'recommended'],
  max: ['max', 'maxvalue', 'maximum', 'high'],
} as const;

/** Nested objects agents tend to group package details under. Flattened one level. */
const NESTED = new Set(['package', 'shipping', 'packagedetails', 'shippingpackage', 'shippingdetails', 'packaging']);

/** Specifics SPARE supplies or eBay takes elsewhere, which the agent's table includes. */
const NOT_SPECIFICS = new Set(['sku', 'calfracsku', 'condition', 'itemcondition']);

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

const isNotAvailable = (v: string) => /^not available$/i.test(v.trim());
const str = (v: unknown) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

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
      .filter((y) => y && !isNotAvailable(y));

  if (Array.isArray(v)) {
    for (const item of v) {
      if (!item || typeof item !== 'object') continue;
      const m = flatten(item as Record<string, unknown>);
      const name = String(m.get('name') ?? m.get('aspect') ?? m.get('itemspecific') ?? '').trim();
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
    if (!s.name || !s.values.length || seen.has(k) || NOT_SPECIFICS.has(keyOf(s.name))) return false;
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

interface Fence {
  lang: string;
  body: string;
}

function fences(text: string): Fence[] {
  return [...text.matchAll(/```([A-Za-z]*)[^\n]*\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1].toLowerCase(), body: m[2] }));
}

const braces = (s: string) => {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  return start !== -1 && end > start ? s.slice(start, end + 1) : null;
};

/**
 * JSON as a chat agent tends to break it: real line breaks and tabs inside strings. Those
 * are escaped; anything else wrong is left for JSON.parse to report.
 */
function repairJson(s: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      else if (ch === '\n') {
        out += '\\n';
        continue;
      } else if (ch === '\r') continue;
      else if (ch === '\t') {
        out += '\\t';
        continue;
      }
    } else if (ch === '"') {
      inString = true;
    }
    out += ch;
  }
  return out;
}

function parseObject(s: string): { value?: Record<string, unknown>; error?: string } {
  for (const attempt of [s, repairJson(s)]) {
    try {
      const v = JSON.parse(attempt);
      if (v && typeof v === 'object' && !Array.isArray(v)) return { value: v as Record<string, unknown> };
      return { error: "isn't a JSON object" };
    } catch (err) {
      if (attempt !== s) return { error: err instanceof Error ? err.message : 'parse error' };
    }
  }
  return { error: 'parse error' };
}

/**
 * The agent's whole reply may be pasted, not just the JSON: a JSON fence is preferred, then
 * any other fence holding an object, then the text itself.
 */
function findObject(text: string): { value?: Record<string, unknown>; error?: string } {
  const blocks = fences(text);
  const candidates = [
    ...blocks.filter((b) => b.lang === 'json').map((b) => b.body),
    ...blocks.filter((b) => b.lang !== 'json').map((b) => b.body),
    text,
  ]
    .map(braces)
    .filter((c): c is string => !!c);

  let firstError: string | undefined;
  for (const c of candidates) {
    const r = parseObject(c);
    if (r.value) return r;
    firstError ??= r.error;
  }
  return { error: firstError ?? 'no JSON object' };
}

/** The HTML from section 2, for when the JSON left it out. */
function findDescription(text: string): string {
  const fenced = fences(text).find((b) => b.lang === 'html' || /^\s*<div\b/i.test(b.body));
  if (fenced) return fenced.body.trim();
  return /<div\s+style=["'][^"']*font-family[\s\S]*<\/div>/i.exec(text)?.[0] ?? '';
}

const unique = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/**
 * Reads whatever the agent said back. Forgiving about shape — the whole six-section reply
 * pasted around the JSON, renamed keys, "$1,299.00" prices, line breaks inside strings —
 * and strict only about there being a JSON object at all, since guessing at free text would
 * publish nonsense.
 */
export function parseAgentOutput(text: string): AgentParseResult {
  const notes: string[] = [];
  const found = findObject(text ?? '');
  if (!found.value) {
    return {
      listing: null,
      notes,
      error: found.error === 'no JSON object'
        ? "Couldn't find the SPARE Import JSON in the agent's answer. Ask it to add section 7."
        : `The SPARE Import JSON isn't valid (${found.error}). Ask the agent to repeat section 7.`,
    };
  }

  const m = flatten(found.value);

  // Titles: a recommended one and alternatives, or a list with the recommended first.
  const titleList = pick(m, 'titles');
  const listed = Array.isArray(titleList) ? titleList.map(str) : [];
  const alternates = pick(m, 'alternateTitles');
  const title = str(pick(m, 'title')) || listed[0] || '';
  const titleOptions = unique([title, ...(Array.isArray(alternates) ? alternates.map(str) : []), ...listed]);

  // Category: an ID, a path, or a bare name, under whichever key the agent chose.
  let categoryId = /\d{3,}/.exec(str(pick(m, 'categoryId')))?.[0] ?? '';
  let categoryPath = str(pick(m, 'categoryPath')) || undefined;
  let categoryName = str(pick(m, 'categoryName')) || undefined;
  const loose = str(pick(m, 'category'));
  if (loose) {
    if (loose.includes('>')) categoryPath ??= loose;
    else {
      categoryId ||= /\d{3,}/.exec(loose)?.[0] ?? '';
      const name = loose.replace(/\d{3,}/, '').replace(/^[-–—:\s]+/, '').trim();
      if (name) categoryName ??= name;
    }
  }
  if (!categoryName && categoryPath) categoryName = categoryPath.split('>').pop()?.trim() || undefined;
  const alternateCategoryPath = str(pick(m, 'alternateCategoryPath')) || undefined;

  // Price: an explicit one, or the target from the agent's tiers.
  const tiers = pick(m, 'prices');
  const tierMap = tiers && typeof tiers === 'object' && !Array.isArray(tiers) ? flatten(tiers as Record<string, unknown>) : null;
  const tier = (field: 'quickSale' | 'target' | 'max') => (tierMap ? toNumber(pick(tierMap, field)) : null);
  const priceOptions: PriceOption[] = [
    { label: 'Quick sale', amount: tier('quickSale') },
    { label: 'Target', amount: tier('target') },
    { label: 'Max value', amount: tier('max') },
  ].flatMap((t) => (t.amount != null && t.amount > 0 ? [{ label: t.label, amount: t.amount }] : []));
  const explicitPrice = toNumber(pick(m, 'price'));
  const price = explicitPrice && explicitPrice > 0 ? explicitPrice : (tier('target') ?? priceOptions[0]?.amount ?? null);

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

  let description = String(pick(m, 'descriptionHtml') ?? '').trim();
  if (!description) {
    description = findDescription(text);
    if (description) notes.push("The description was taken from section 2 of the agent's answer.");
  }

  const researchedSku = str(pick(m, 'researchedSku'));

  const listing: AgentListing = {
    researchedSku: researchedSku || undefined,
    title,
    titleOptions,
    categoryId,
    categoryName,
    categoryPath,
    alternateCategoryPath,
    price,
    priceOptions,
    priceConfidence: str(pick(m, 'priceConfidence')) || undefined,
    bestOffer,
    descriptionHtml: toHtml(description),
    specifics: toSpecifics(pick(m, 'specifics')),
    weightLb,
    weightOz,
    lengthIn,
    widthIn,
    heightIn,
  };
  return { listing, notes };
}

const skuKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * The agent answers one part at a time, but a reply pasted into the wrong part would list
 * the wrong thing with the right photographs. Refused rather than warned about.
 */
export function researchMismatch(listing: AgentListing, sku: string): string | null {
  if (!listing.researchedSku) return null;
  return skuKey(listing.researchedSku) === skuKey(sku)
    ? null
    : `This research is for ${listing.researchedSku}, but this part is ${sku}.`;
}

/**
 * The agent's standard Condition section says every item is new and unused. True for most
 * surplus stock — not for a part inspected as used.
 */
export function descriptionConditionWarning(listing: AgentListing, itemCondition: string | undefined): string | null {
  const condition = tradingCondition(itemCondition);
  if (!condition || condition.id === '1000') return null;
  const text = listing.descriptionHtml.replace(/<[^>]+>/g, ' ');
  return /\bnew,?\s+(?:and\s+)?unused\b/i.test(text)
    ? `The description says the part is new and unused, but it was inspected as ${itemCondition}. Edit the Condition section before publishing.`
    : null;
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
  if (!listing.categoryId) {
    problems.push(listing.categoryPath ? 'Choose the eBay category that matches the agent’s suggestion.' : 'Category ID is missing.');
  }
  if (listing.price == null || listing.price <= 0) problems.push('Price is missing.');
  if (!listing.descriptionHtml.replace(/<[^>]+>/g, '').trim()) problems.push('Description is missing.');
  if ((listing.weightLb ?? 0) * 16 + (listing.weightOz ?? 0) <= 0) problems.push('Package weight is missing.');
  if (![listing.lengthIn, listing.widthIn, listing.heightIn].every((d) => d != null && d > 0))
    problems.push('Package dimensions are missing.');
  for (const s of listing.specifics) {
    const long = [s.name, ...s.values].find((v) => v.length > MAX_SPECIFIC);
    if (long) problems.push(`Item specific "${s.name}" has text over eBay's ${MAX_SPECIFIC}-character limit.`);
  }
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
  const opt = (v: unknown) => (v == null || v === '' ? undefined : s(v));
  const specifics = Array.isArray(o.specifics)
    ? (o.specifics as unknown[]).flatMap((sp) => {
        if (!sp || typeof sp !== 'object') return [];
        const r = sp as Record<string, unknown>;
        const name = s(r.name).trim();
        const values = (Array.isArray(r.values) ? r.values : [r.values]).map((v) => s(v).trim()).filter(Boolean);
        return name && values.length ? [{ name, values }] : [];
      })
    : [];
  const priceOptions = Array.isArray(o.priceOptions)
    ? (o.priceOptions as unknown[]).flatMap((p) => {
        const r = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
        const amount = n(r.amount);
        return amount != null && amount > 0 ? [{ label: s(r.label), amount }] : [];
      })
    : [];
  return {
    researchedSku: opt(o.researchedSku),
    title: s(o.title).replace(/\s+/g, ' ').trim(),
    titleOptions: Array.isArray(o.titleOptions) ? (o.titleOptions as unknown[]).map(s) : [],
    categoryId: s(o.categoryId).trim(),
    categoryName: opt(o.categoryName),
    categoryPath: opt(o.categoryPath),
    alternateCategoryPath: opt(o.alternateCategoryPath),
    price: n(o.price),
    priceOptions,
    priceConfidence: opt(o.priceConfidence),
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

/** A category eBay suggests, ranked by how closely its path matches the agent's. */
export interface CategorySuggestion {
  id: string;
  name: string;
  path: string;
  siteId: string;
  score: number;
  /** Its last level shares a word with the agent's; only then is it picked automatically. */
  leafMatch: boolean;
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

/** The newest Copilot research saved for a part. */
export interface ResearchResult {
  found: boolean;
  createdAt?: string;
  listing?: AgentListing | null;
  notes?: string[];
  error?: string;
}

export interface ListingRequest {
  listing: AgentListing;
  policies: PolicyChoice;
  submittedBy?: string;
}

// Words that appear in almost every parts category path, and so say nothing about fit.
const CATEGORY_NOISE = new Set(['and', 'the', 'for', 'with', 'other', 'part', 'parts', 'accessory', 'accessories', 'ebay', 'motors']);

const categoryWords = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !CATEGORY_NOISE.has(w))
      .map((w) => w.replace(/ies$/, 'y').replace(/s$/, ''))
  );

const leafOf = (path: string) => path.split('>').pop() ?? '';

/**
 * How well an eBay category matches the path the agent recommended. The last level carries
 * the most weight: "Thermostats & Housings" answering "Thermostats" matters more than both
 * paths passing through "Engine Cooling". Levels every parts path shares count for nothing.
 */
export function categoryMatch(agentPath: string, candidatePath: string): { score: number; leafMatch: boolean } {
  const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w)).length;
  const leaf = overlap(categoryWords(leafOf(agentPath)), categoryWords(leafOf(candidatePath)));
  return { score: leaf * 3 + overlap(categoryWords(agentPath), categoryWords(candidatePath)), leafMatch: leaf > 0 };
}
