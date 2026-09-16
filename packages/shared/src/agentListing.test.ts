import { describe, expect, it } from 'vitest';
import {
  agentPrompt,
  coerceAgentListing,
  fillFromPart,
  listingProblems,
  parseAgentOutput,
  parseDimensions,
  parseWeight,
  tradingCondition,
  type AgentListing,
} from './agentListing.js';
import { groupPartsBySku } from './grouping.js';
import type { InventoryPart } from './types.js';

const group = (over: Partial<InventoryPart> = {}) =>
  groupPartsBySku([
    {
      id: 'a',
      sku: '5-188X',
      description: 'U-JOINT 1480',
      manufacturer: 'Spicer Axle-Trans Divs Dana Corp.',
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
      boxCondition: 'Excellent',
      ...over,
    } as InventoryPart,
  ])[0];

const complete: AgentListing = {
  title: 'Spicer 5-188X U-Joint Kit 1480 Series',
  categoryId: '262252',
  price: 110,
  bestOffer: true,
  descriptionHtml: '<p>Genuine Spicer.</p>',
  specifics: [{ name: 'Brand', values: ['Spicer'] }],
  weightLb: 4,
  weightOz: 0,
  lengthIn: 8,
  widthIn: 6,
  heightIn: 4,
};

describe('parseAgentOutput', () => {
  it('reads the exact shape the prompt asks for', () => {
    const { listing, error } = parseAgentOutput(
      JSON.stringify({
        title: 'Spicer 5-188X U-Joint',
        categoryId: '262252',
        categoryName: 'Driveshaft Bearings & U-Joints',
        price: 110,
        bestOffer: false,
        description: '<p>Genuine.</p>',
        itemSpecifics: { Brand: 'Spicer', 'Manufacturer Part Number': 'SPL55-1X' },
        weightLb: 4,
        weightOz: 2,
        lengthIn: 8,
        widthIn: 6,
        heightIn: 4,
      })
    );
    expect(error).toBeUndefined();
    expect(listing).toMatchObject({
      title: 'Spicer 5-188X U-Joint',
      categoryId: '262252',
      categoryName: 'Driveshaft Bearings & U-Joints',
      price: 110,
      bestOffer: false,
      descriptionHtml: '<p>Genuine.</p>',
      weightLb: 4,
      weightOz: 2,
      lengthIn: 8,
      widthIn: 6,
      heightIn: 4,
    });
    expect(listing!.specifics).toEqual([
      { name: 'Brand', values: ['Spicer'] },
      { name: 'Manufacturer Part Number', values: ['SPL55-1X'] },
    ]);
  });

  it('finds the JSON inside prose and a code fence', () => {
    const text = 'Here is the listing:\n```json\n{"title": "Belt", "price": "$1,299.50"}\n```\nLet me know!';
    const { listing } = parseAgentOutput(text);
    expect(listing?.title).toBe('Belt');
    expect(listing?.price).toBe(1299.5);
  });

  it('accepts renamed keys and package details grouped together', () => {
    const { listing } = parseAgentOutput(
      JSON.stringify({
        'Listing Title': 'Valve',
        category: '33575 - Battery Accessories',
        start_price: 20,
        item_specifics: [{ name: 'Brand', value: 'Haldex' }],
        package: { weight: '4 lb 8 oz', dimensions: '10 x 8 x 6 in' },
      })
    );
    expect(listing).toMatchObject({
      title: 'Valve',
      categoryId: '33575',
      categoryName: 'Battery Accessories',
      price: 20,
      weightLb: 4,
      weightOz: 8,
      lengthIn: 10,
      widthIn: 8,
      heightIn: 6,
    });
    expect(listing!.specifics).toEqual([{ name: 'Brand', values: ['Haldex'] }]);
  });

  it('turns a fractional pound figure into pounds and ounces', () => {
    expect(parseAgentOutput('{"weightLb": 2.5}').listing).toMatchObject({ weightLb: 2, weightOz: 8 });
  });

  it('wraps a plain-text description in paragraphs, escaping it', () => {
    const { listing } = parseAgentOutput(JSON.stringify({ description: 'Fits <all> trucks.\n\nNew in box.' }));
    expect(listing!.descriptionHtml).toBe('<p>Fits &lt;all&gt; trucks.</p><p>New in box.</p>');
  });

  it('keeps Best Offer on when the agent says nothing, and says so', () => {
    const { listing, notes } = parseAgentOutput('{"title": "x"}');
    expect(listing!.bestOffer).toBe(true);
    expect(notes.join(' ')).toMatch(/Best Offer/);
  });

  it('refuses free text rather than guessing at it', () => {
    expect(parseAgentOutput('A great belt, sell it for $40').error).toMatch(/JSON/);
    expect(parseAgentOutput('{"title": "x",}').error).toMatch(/valid JSON/);
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

describe('fillFromPart', () => {
  it('adds brand and part number from SPARE when the agent left them out', () => {
    const filled = fillFromPart({ ...complete, specifics: [] }, group());
    expect(filled.specifics).toEqual([
      { name: 'Brand', values: ['Spicer Axle-Trans Divs Dana Corp.'] },
      { name: 'Manufacturer Part Number', values: ['5-188X'] },
    ]);
  });

  it("never overrides the agent's own values", () => {
    const filled = fillFromPart(complete, group());
    expect(filled.specifics.find((s) => s.name === 'Brand')?.values).toEqual(['Spicer']);
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
    const problems = listingProblems({
      ...complete,
      title: 'x'.repeat(81),
      categoryId: '',
      price: null,
      descriptionHtml: '<p> </p>',
      weightLb: 0,
      weightOz: 0,
      heightIn: null,
    });
    expect(problems).toEqual([
      'Title is 81 characters; eBay allows 80.',
      'Category ID is missing.',
      'Price is missing.',
      'Description is missing.',
      'Package weight is missing.',
      'Package dimensions are missing.',
    ]);
  });

  it('accepts a package weighed only in ounces', () => {
    expect(listingProblems({ ...complete, weightLb: 0, weightOz: 6 })).toEqual([]);
  });
});

describe('tradingCondition', () => {
  it("maps SPARE's conditions onto eBay's IDs", () => {
    expect(tradingCondition('New')?.id).toBe('1000');
    expect(tradingCondition('Good')?.id).toBe('3000');
    expect(tradingCondition('Poor')?.id).toBe('7000');
    expect(tradingCondition(undefined)).toBeNull();
  });
});

describe('agentPrompt', () => {
  it('carries the confirmed facts and the reply shape', () => {
    const prompt = agentPrompt(group({ notes: 'Two in sealed bags' }));
    expect(prompt).toContain('Part number (SKU): 5-188X');
    expect(prompt).toContain('Condition (inspected): New, packaging: Excellent');
    expect(prompt).toContain('Quantity available: 3');
    expect(prompt).toContain('Warehouse notes: Two in sealed bags');
    expect(prompt).toContain('"categoryId"');
  });

  it('round-trips: the shape it asks for is the shape the parser reads', () => {
    const shape = agentPrompt(group()).match(/\{[\s\S]*?\n\}/)![0];
    const { listing, error } = parseAgentOutput(shape);
    expect(error).toBeUndefined();
    expect(listing).not.toBeNull();
  });
});

describe('coerceAgentListing', () => {
  it('rebuilds a well-formed request unchanged', () => {
    expect(coerceAgentListing(complete)).toEqual({ ...complete, categoryName: undefined });
  });

  it('turns junk into a listing that fails its checks, never into an exception', () => {
    const coerced = coerceAgentListing({ title: 42, price: 'lots', specifics: 'Brand' });
    expect(coerced.title).toBe('42');
    expect(coerced.price).toBeNull();
    expect(coerced.specifics).toEqual([]);
    expect(listingProblems(coerced).length).toBeGreaterThan(0);
    expect(() => coerceAgentListing(null)).not.toThrow();
  });
});
