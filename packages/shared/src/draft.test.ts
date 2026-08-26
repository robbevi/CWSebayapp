import { describe, expect, it } from 'vitest';
import { buildTitle, composeDraft, draftReadiness, MAX_TITLE, toEbayCondition } from './draft.js';
import { groupPartsBySku } from './grouping.js';
import type { InventoryPart } from './types.js';

function part(over: Partial<InventoryPart> & { sku: string; id: string }): InventoryPart {
  return {
    description: '',
    manufacturer: '',
    inventorySite: 'NDPARTS',
    binLocation: '',
    qoh: 1,
    confirmedQoh: null,
    photographed: false,
    itemListed: false,
    transferredToMarketRecovery: false,
    photos: [],
    workflowStatus: 'NotStarted',
    ...over,
  };
}

const photo = (n: string) => ({ fileId: n, fileName: n, url: `/api/photos/${n}/content`, uploadedAt: '' });

/** A part that has been through photo, count and condition. */
const worked = (over: Partial<InventoryPart> = {}) =>
  groupPartsBySku([
    part({
      id: 'a',
      sku: 'R950069',
      description: 'CARTRIDGE, AIR DRYER (MACK)',
      manufacturer: 'Mack Trucks, Inc.',
      photographed: true,
      photos: [photo('p1'), photo('p2')],
      confirmedQoh: 3,
      qoh: 3,
      itemCondition: 'Good',
      boxCondition: 'No Box',
      activeRecoveryPriceBasis: 149.99,
      ...over,
    }),
  ])[0];

describe('toEbayCondition', () => {
  it('maps the conditions in use onto eBay values', () => {
    expect(toEbayCondition('New')).toBe('NEW');
    expect(toEbayCondition('Like New')).toBe('LIKE_NEW');
    expect(toEbayCondition('Good')).toBe('USED_GOOD');
    expect(toEbayCondition('Fair')).toBe('USED_ACCEPTABLE');
  });

  it('sends Poor to for-parts rather than over-claiming it', () => {
    expect(toEbayCondition('Poor')).toBe('FOR_PARTS_OR_NOT_WORKING');
  });

  it('is null for nothing and for anything unrecognised', () => {
    expect(toEbayCondition(undefined)).toBeNull();
    expect(toEbayCondition('Immaculate')).toBeNull();
  });
});

describe('buildTitle', () => {
  it('leads with brand, then what it is, then the part number', () => {
    expect(buildTitle({ sku: 'R950069', description: 'CARTRIDGE, AIR DRYER', manufacturer: 'Mack' })).toBe(
      'Mack CARTRIDGE AIR DRYER R950069'
    );
  });

  it('does not repeat a manufacturer the description already names', () => {
    const title = buildTitle({ sku: 'X1', description: 'VALVE (HALDEX)', manufacturer: 'HALDEX' });
    expect(title).toBe('HALDEX VALVE X1');
  });

  it('drops "Not Available", which is a placeholder rather than a brand', () => {
    expect(buildTitle({ sku: 'X06-02-000', description: 'DRYER, DESICCANT', manufacturer: 'Not Available' })).toBe(
      'DRYER DESICCANT X06-02-000'
    );
  });

  it('never exceeds eBay\'s limit, and never ends mid-word', () => {
    const title = buildTitle({
      sku: 'LONGPART-0001',
      description: 'EXTREMELY LONG DESCRIPTION OF A COMPONENT THAT KEEPS GOING WELL BEYOND ANY SENSIBLE LIMIT',
      manufacturer: 'A Very Long Manufacturer Name Incorporated',
    });
    expect(title.length).toBeLessThanOrEqual(MAX_TITLE);
    expect(title).not.toMatch(/\s$/);
  });

  it('falls back to the SKU when there is nothing else', () => {
    expect(buildTitle({ sku: 'X1', description: '', manufacturer: '' })).toBe('X1');
  });
});

describe('draftReadiness', () => {
  it('is ready once photographed, counted and conditioned', () => {
    expect(draftReadiness(worked())).toMatchObject({ ready: true, blockers: [], missing: [] });
  });

  it('still drafts without a price, and says a price is what is missing', () => {
    const r = draftReadiness(worked({ activeRecoveryPriceBasis: undefined }));
    expect(r.ready).toBe(true);
    expect(r.missing).toEqual(['price']);
  });

  it('will not draft without photographs', () => {
    const r = draftReadiness(worked({ photographed: false, photos: [] }));
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain('no photographs');
  });

  it('will not draft an uncounted part', () => {
    expect(draftReadiness(worked({ confirmedQoh: null })).blockers).toContain('quantity not confirmed');
  });

  it('will not draft something already on eBay', () => {
    expect(draftReadiness(worked({ itemListed: true })).blockers).toContain('already listed on eBay');
  });
});

describe('composeDraft', () => {
  it('builds absolute image urls, because eBay fetches them itself', () => {
    const draft = composeDraft(worked(), 'https://example.com/')!;
    expect(draft.imageUrls).toEqual([
      'https://example.com/api/photos/p1/content',
      'https://example.com/api/photos/p2/content',
    ]);
  });

  it('carries the counted quantity rather than the system one', () => {
    const draft = composeDraft(worked({ qoh: 9, confirmedQoh: 3 }), 'https://example.com')!;
    expect(draft.quantity).toBe(3);
  });

  it('leaves the price null when nothing says what it is worth', () => {
    expect(composeDraft(worked({ activeRecoveryPriceBasis: undefined }), 'https://example.com')!.price).toBeNull();
  });

  it('escapes the description, so a stray angle bracket cannot break the markup', () => {
    const draft = composeDraft(worked({ description: 'VALVE <1/2" NPT> & FITTING' }), 'https://example.com')!;
    expect(draft.descriptionHtml).toContain('&lt;1/2&quot; NPT&gt; &amp; FITTING');
    expect(draft.descriptionHtml).not.toContain('<1/2');
  });

  it('returns nothing when the part is not ready', () => {
    expect(composeDraft(worked({ photographed: false, photos: [] }), 'https://example.com')).toBeNull();
  });
});
