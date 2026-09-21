import { describe, expect, it } from 'vitest';
import {
  agentPrompt,
  categoryMatch,
  coerceAgentListing,
  descriptionConditionWarning,
  fillFromPart,
  listingProblems,
  parseAgentOutput,
  parseDimensions,
  parseWeight,
  researchMismatch,
  tradingCondition,
  type AgentListing,
} from './agentListing.js';
import { groupPartsBySku } from './grouping.js';
import type { InventoryPart } from './types.js';

const group = (over: Partial<InventoryPart> = {}) =>
  groupPartsBySku([
    {
      id: 'a',
      sku: '417-7782',
      description: 'THERMOSTAT ASSY (CAT)',
      manufacturer: 'Caterpillar Inc.',
      inventorySite: 'NDPARTS',
      binLocation: 'C-5-3',
      qoh: 3,
      confirmedQoh: 3,
      photographed: true,
      itemListed: false,
      transferredToMarketRecovery: false,
      photos: [],
      workflowStatus: 'InProgress',
      itemCondition: 'New',
      boxCondition: 'Good',
      ...over,
    } as InventoryPart,
  ])[0];

const complete: AgentListing = {
  title: 'CAT 417-7782 Engine Water Temperature Regulator Thermostat Assembly OEM',
  titleOptions: ['CAT 417-7782 Engine Water Temperature Regulator Thermostat Assembly OEM'],
  categoryId: '33612',
  price: 89.99,
  priceOptions: [],
  bestOffer: true,
  descriptionHtml: '<p>Genuine Caterpillar.</p>',
  specifics: [{ name: 'Brand', values: ['Caterpillar'] }],
  weightLb: 1,
  weightOz: 8,
  lengthIn: 8,
  widthIn: 6,
  heightIn: 4,
};

const HTML =
  '<div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:1.4;">' +
  '<h2 style="font-size:16px; margin-bottom:6px;">Overview / Description</h2>' +
  '<p>Genuine Caterpillar 417-7782 Thermostat Assembly.</p>' +
  '<h2 style="font-size:16px; margin-bottom:6px;">Condition</h2><br>All items sold by our store are new, unused, and have been stored indoors.' +
  '</div>';

const SECTION_7 = {
  sku: '417-7782',
  title: 'CAT 417-7782 Engine Water Temperature Regulator Thermostat Assembly OEM',
  alternateTitles: [
    'Caterpillar 417-7782 Thermostat Assembly Engine Temperature Regulator',
    'CAT 417-7782 OEM Thermostat Assembly Fits C4.4 C6.6 C7.1 Engines',
    'Genuine Caterpillar 417-7782 Engine Cooling System Thermostat Assembly',
  ],
  categoryPath:
    'eBay Motors > Parts & Accessories > Heavy Equipment, Parts & Attachments > Heavy Equipment Parts & Accessories > Engine Cooling Parts > Thermostats',
  categoryId: '',
  prices: { quickSale: 69.99, target: 89.99, max: 119.99 },
  priceConfidence: 'High',
  itemSpecifics: {
    SKU: '417-7782',
    Brand: 'Caterpillar',
    'Manufacturer Part Number': '417-7782',
    'OE/OEM Part Number': '417-7782',
    'Engine Compatibility': 'C4.4, C6.6, C7.1',
    'Country/Region of Manufacture': 'Turkey',
    'VMRS Code': 'Not Available',
    UPC: 'Not Available',
    Condition: 'New Surplus OEM',
  },
  package: { weightLb: 1, weightOz: 8, lengthIn: 8, widthIn: 6, heightIn: 4 },
  descriptionHtml: HTML.replace(/"/g, "'"),
};

/** The agent's whole reply, as someone would copy it out of Copilot. */
const reply = (section7: string) => `Caterpillar 417-7782 Thermostat Assembly Research & eBay Listing Package
Research Date: September 15, 2026

1. SEO Listing Titles
Recommended Title
CAT 417-7782 Engine Water Temperature Regulator Thermostat Assembly OEM
Character Count: 71

2. eBay Description (Paste-Ready HTML)
\`\`\`html
${HTML}
\`\`\`

3. Item Specifics
Item Specific | Value
Brand | Caterpillar

4. Category Recommendation
eBay Motors > Parts & Accessories > Heavy Equipment Parts & Accessories > Engine Cooling Parts > Thermostats

5. Market Price Research
Quick Sale $69.99 | Target Price $89.99 | Max Value $119.99
Confidence Level: High

6. Research Notes
CAT Parts Store: https://parts.cat.com/en/catcorp/product/417-7782

7. SPARE Import
${section7}`;

describe('parseAgentOutput — the eBay Parts Researcher reply', () => {
  const fenced = (obj: unknown) => '```json\n' + JSON.stringify(obj, null, 2) + '\n```';

  it('finds section 7 after the HTML block and reads every field', () => {
    const { listing, error, notes } = parseAgentOutput(reply(fenced(SECTION_7)));
    expect(error).toBeUndefined();
    expect(listing).toMatchObject({
      researchedSku: '417-7782',
      title: SECTION_7.title,
      categoryId: '',
      categoryPath: SECTION_7.categoryPath,
      categoryName: 'Thermostats',
      price: 89.99,
      priceConfidence: 'High',
      weightLb: 1,
      weightOz: 8,
      lengthIn: 8,
      widthIn: 6,
      heightIn: 4,
    });
    expect(listing!.titleOptions).toEqual([SECTION_7.title, ...SECTION_7.alternateTitles]);
    expect(listing!.priceOptions).toEqual([
      { label: 'Quick sale', amount: 69.99 },
      { label: 'Target', amount: 89.99 },
      { label: 'Max value', amount: 119.99 },
    ]);
    expect(listing!.descriptionHtml).toContain("<div style='font-family:Arial");
    expect(notes).toEqual(['Best Offer is on, as on your current listings.']);
  });

  it('drops Not Available values, and the SKU and Condition rows SPARE supplies itself', () => {
    const { listing } = parseAgentOutput(reply(fenced(SECTION_7)));
    expect(listing!.specifics.map((s) => s.name)).toEqual([
      'Brand',
      'Manufacturer Part Number',
      'OE/OEM Part Number',
      'Engine Compatibility',
      'Country/Region of Manufacture',
    ]);
  });

  it('takes the description from section 2 when section 7 leaves it out', () => {
    const { listing, notes } = parseAgentOutput(reply(fenced({ ...SECTION_7, descriptionHtml: undefined })));
    expect(listing!.descriptionHtml).toBe(HTML);
    expect(notes).toContain("The description was taken from section 2 of the agent's answer.");
  });

  it('finds the HTML even when copying lost the code fences', () => {
    const plain = reply(JSON.stringify({ ...SECTION_7, descriptionHtml: undefined })).replace(/```html\n|\n```/g, '\n');
    expect(parseAgentOutput(plain).listing!.descriptionHtml).toBe(HTML);
  });

  it('survives real line breaks inside a JSON string', () => {
    const broken = fenced({ ...SECTION_7, descriptionHtml: 'PLACEHOLDER' }).replace(
      '"PLACEHOLDER"',
      `"<div style='font-family:Arial'>\n<p>Line one</p>\n</div>"`
    );
    const { listing, error } = parseAgentOutput(reply(broken));
    expect(error).toBeUndefined();
    expect(listing!.descriptionHtml).toBe("<div style='font-family:Arial'>\n<p>Line one</p>\n</div>");
  });

  it('asks for section 7 when there is none', () => {
    const { listing, error } = parseAgentOutput(reply('(no section 7)'));
    expect(listing).toBeNull();
    expect(error).toMatch(/section 7/);
  });

  it('says the JSON is broken rather than that it is missing', () => {
    const { error } = parseAgentOutput(reply('```json\n{"title": "x",,}\n```'));
    expect(error).toMatch(/isn't valid/);
  });

  it('prefers an explicit price over the target tier', () => {
    expect(parseAgentOutput(fenced({ ...SECTION_7, price: '$75.00' })).listing!.price).toBe(75);
  });
});

describe('parseAgentOutput — other shapes', () => {
  it('reads a category given as "ID - name"', () => {
    const { listing } = parseAgentOutput('{"category": "33575 - Battery Accessories"}');
    expect(listing).toMatchObject({ categoryId: '33575', categoryName: 'Battery Accessories' });
  });

  it('reads a list of titles with the recommended one first', () => {
    const { listing } = parseAgentOutput('{"titles": ["First", "Second"]}');
    expect(listing).toMatchObject({ title: 'First', titleOptions: ['First', 'Second'] });
  });

  it('accepts renamed keys and package details written out', () => {
    const { listing } = parseAgentOutput(
      JSON.stringify({
        'Listing Title': 'Valve',
        start_price: '$1,299.50',
        item_specifics: [{ name: 'Brand', value: 'Haldex' }],
        package: { weight: '4 lb 8 oz', dimensions: '10 x 8 x 6 in' },
      })
    );
    expect(listing).toMatchObject({ title: 'Valve', price: 1299.5, weightLb: 4, weightOz: 8, lengthIn: 10, widthIn: 8, heightIn: 6 });
    expect(listing!.specifics).toEqual([{ name: 'Brand', values: ['Haldex'] }]);
  });

  it('turns a fractional pound figure into pounds and ounces', () => {
    expect(parseAgentOutput('{"weightLb": 2.5}').listing).toMatchObject({ weightLb: 2, weightOz: 8 });
  });

  it('wraps a plain-text description in paragraphs, escaping it', () => {
    const { listing } = parseAgentOutput(JSON.stringify({ description: 'Fits <all> trucks.\n\nNew in box.' }));
    expect(listing!.descriptionHtml).toBe('<p>Fits &lt;all&gt; trucks.</p><p>New in box.</p>');
  });

  it('refuses free text rather than guessing at it', () => {
    expect(parseAgentOutput('A great belt, sell it for $40').listing).toBeNull();
  });
});

describe('parseWeight / parseDimensions', () => {
  it('reads the usual ways of writing them', () => {
    expect(parseWeight('12 oz')).toEqual({ lb: 0, oz: 12 });
    expect(parseWeight('1.75 lbs')).toEqual({ lb: 1, oz: 12 });
    expect(parseWeight(3)).toEqual({ lb: 3, oz: 0 });
    expect(parseWeight('')).toBeNull();
    expect(parseDimensions('8×6×4')).toEqual({ l: 8, w: 6, h: 4 });
    expect(parseDimensions('12" by 10" by 2"')).toEqual({ l: 12, w: 10, h: 2 });
    expect(parseDimensions({ length: 5, width: 4, height: 3 })).toEqual({ l: 5, w: 4, h: 3 });
    expect(parseDimensions('large')).toBeNull();
  });
});

describe('researchMismatch', () => {
  it('accepts the same SKU written differently', () => {
    expect(researchMismatch({ ...complete, researchedSku: '4177782' }, '417-7782')).toBeNull();
    expect(researchMismatch({ ...complete, researchedSku: undefined }, '417-7782')).toBeNull();
  });

  it('refuses research for a different part', () => {
    expect(researchMismatch({ ...complete, researchedSku: '5-188X' }, '417-7782')).toBe(
      'This research is for 5-188X, but this part is 417-7782.'
    );
  });
});

describe('descriptionConditionWarning', () => {
  const standard = { ...complete, descriptionHtml: HTML };

  it('is quiet for a new part, including one graded Good for shelf dust', () => {
    expect(descriptionConditionWarning(standard, 'New')).toBeNull();
    expect(descriptionConditionWarning(standard, 'Good')).toBeNull();
  });

  it("flags the standard new-and-unused statement on a part that isn't new", () => {
    expect(descriptionConditionWarning(standard, 'Fair')).toMatch(/inspected as Fair/);
  });

  it('is quiet once the statement has been changed', () => {
    expect(descriptionConditionWarning({ ...complete, descriptionHtml: '<p>Used, tested.</p>' }, 'Fair')).toBeNull();
  });
});

describe('fillFromPart', () => {
  it('adds brand and part number from SPARE when the agent left them out', () => {
    const filled = fillFromPart({ ...complete, specifics: [] }, group());
    expect(filled.specifics).toEqual([
      { name: 'Brand', values: ['Caterpillar Inc.'] },
      { name: 'Manufacturer Part Number', values: ['417-7782'] },
    ]);
  });

  it("never overrides the agent's own values", () => {
    expect(fillFromPart(complete, group()).specifics.find((s) => s.name === 'Brand')?.values).toEqual(['Caterpillar']);
  });

  it('falls back to Unbranded rather than listing a placeholder as the brand', () => {
    const filled = fillFromPart({ ...complete, specifics: [] }, group({ manufacturer: 'Not Available' }));
    expect(filled.specifics[0]).toEqual({ name: 'Brand', values: ['Unbranded'] });
  });
});

describe('listingProblems', () => {
  it('passes a complete listing', () => {
    expect(listingProblems(complete)).toEqual([]);
  });

  it('names everything that would stop it', () => {
    expect(
      listingProblems({
        ...complete,
        title: 'x'.repeat(81),
        categoryId: '',
        price: null,
        descriptionHtml: '<p> </p>',
        weightLb: 0,
        weightOz: 0,
        heightIn: null,
        specifics: [{ name: 'Applications', values: ['y'.repeat(66)] }],
      })
    ).toEqual([
      'Title is 81 characters; eBay allows 80.',
      'Category ID is missing.',
      'Price is missing.',
      'Description is missing.',
      'Package weight is missing.',
      'Package dimensions are missing.',
      `Item specific "Applications" has text over eBay's 65-character limit.`,
    ]);
  });

  it('asks for a category to be chosen when the agent gave only a path', () => {
    expect(listingProblems({ ...complete, categoryId: '', categoryPath: 'eBay Motors > Thermostats' })).toEqual([
      'Choose the eBay category that matches the agent’s suggestion.',
    ]);
  });

  it('accepts a package weighed only in ounces', () => {
    expect(listingProblems({ ...complete, weightLb: 0, weightOz: 6 })).toEqual([]);
  });
});

describe('tradingCondition', () => {
  it("maps SPARE's conditions onto eBay's IDs", () => {
    expect(tradingCondition('New')?.id).toBe('1000');
    expect(tradingCondition('Like New')?.id).toBe('1000');
    expect(tradingCondition('Good')?.id).toBe('1000');
    expect(tradingCondition('Fair')?.id).toBe('3000');
    expect(tradingCondition('Poor')?.id).toBe('7000');
    expect(tradingCondition(undefined)).toBeNull();
  });
});

describe('agentPrompt', () => {
  it('carries the confirmed facts and asks for section 7', () => {
    const prompt = agentPrompt(group({ notes: 'Two in sealed bags' }));
    expect(prompt).toContain('- SKU: 417-7782');
    expect(prompt).toContain('- Condition (inspected): New, packaging: Good');
    expect(prompt).toContain('- Quantity available: 3');
    expect(prompt).toContain('- Warehouse notes: Two in sealed bags');
    expect(prompt).toContain('7. SPARE Import');
    expect(prompt).not.toMatch(/instead of using the standard new-and-unused statement/);
  });

  it('asks for the standard statement on a part graded Good, which lists as New', () => {
    expect(agentPrompt(group({ itemCondition: 'Good' }))).not.toMatch(/not new/);
  });

  it("tells the agent not to call a used part new", () => {
    expect(agentPrompt(group({ itemCondition: 'Fair' }))).toMatch(/inspected as "Fair", not new/);
  });

  it('round-trips: the shape it asks for is the shape the parser reads', () => {
    const { listing, error } = parseAgentOutput(agentPrompt(group()));
    expect(error).toBeUndefined();
    expect(listing).not.toBeNull();
  });

  it('stays short enough to paste into a chat', () => {
    expect(agentPrompt(group()).length).toBeLessThan(3000);
  });
});

describe('coerceAgentListing', () => {
  it('rebuilds a well-formed request unchanged', () => {
    const full: AgentListing = {
      ...complete,
      researchedSku: '417-7782',
      categoryName: 'Thermostats',
      categoryPath: 'eBay Motors > Thermostats',
      alternateCategoryPath: 'Business & Industrial > Engines',
      priceOptions: [{ label: 'Target', amount: 89.99 }],
      priceConfidence: 'High',
    };
    expect(coerceAgentListing(full)).toEqual(full);
  });

  it('turns junk into a listing that fails its checks, never into an exception', () => {
    const coerced = coerceAgentListing({ title: 42, price: 'lots', specifics: 'Brand', priceOptions: [{ amount: -1 }] });
    expect(coerced.title).toBe('42');
    expect(coerced.price).toBeNull();
    expect(coerced.specifics).toEqual([]);
    expect(coerced.priceOptions).toEqual([]);
    expect(listingProblems(coerced).length).toBeGreaterThan(0);
    expect(() => coerceAgentListing(null)).not.toThrow();
  });
});

describe('categoryMatch', () => {
  const agent =
    'eBay Motors > Parts & Accessories > Heavy Equipment, Parts & Attachments > Heavy Equipment Parts & Accessories > Engine Cooling Parts > Thermostats';
  // What eBay actually suggested for the 417-7782 sample.
  const thermostats = 'eBay Motors > Parts & Accessories > Car & Truck Parts & Accessories > Engine Cooling Components > Thermostats & Housings';
  const heavyEngines = 'Business & Industrial > Heavy Equipment, Parts & Attachments > Heavy Equipment Parts & Accessories > Complete Engines & Engine Parts';
  const radiators = 'eBay Motors > Parts & Accessories > Car & Truck Parts & Accessories > Engine Cooling Components > Radiators';
  const manuals = 'eBay Motors > Parts & Accessories > Manuals & Literature > Boats & Watercraft';

  it('ranks the matching last level first, then shared levels, and generic levels not at all', () => {
    const scores = [thermostats, heavyEngines, radiators, manuals].map((c) => categoryMatch(agent, c).score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(categoryMatch(agent, manuals).score).toBe(0);
  });

  it('only calls it a leaf match when the last levels share a word', () => {
    expect(categoryMatch(agent, thermostats).leafMatch).toBe(true);
    expect(categoryMatch(agent, heavyEngines).leafMatch).toBe(false);
  });

  it('treats singular and plural alike', () => {
    expect(categoryMatch('X > Batteries', 'Y > Battery Accessories').leafMatch).toBe(true);
  });
});
