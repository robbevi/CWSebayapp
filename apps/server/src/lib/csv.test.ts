import { describe, expect, it } from 'vitest';
import { parseBoolean, parseDateOrNull, parseInventoryCsv, parseNumberOrNull } from './csv.js';

const HEADER =
  'Bin Location,Box Condition,Cataloging Start Date,Confirmed Quantity On Hand,Part Photographs ID,Import Sequence Number,Inventory Site,Inventory Part ID,Item Listed Date,Item Listed,Item Photographed,Transferred To Market Recovery,Manufacturer Name,Notes,Part Photographs,Part Description,Photo URLs,Quantity On Hand,SKU,Status Code,State Code,Timezone Rule Version Number,UTC Conversion Timezone Code,Version Number,Owning Business Unit,Item Type,Path';

describe('parseBoolean', () => {
  it('parses common truthy values', () => {
    expect(parseBoolean('Yes')).toBe(true);
    expect(parseBoolean('TRUE')).toBe(true);
    expect(parseBoolean('1')).toBe(true);
  });

  it('treats everything else as false', () => {
    expect(parseBoolean('No')).toBe(false);
    expect(parseBoolean('')).toBe(false);
    expect(parseBoolean(undefined)).toBe(false);
  });
});

describe('parseNumberOrNull', () => {
  it('returns null for empty/undefined/non-numeric', () => {
    expect(parseNumberOrNull('')).toBeNull();
    expect(parseNumberOrNull(undefined)).toBeNull();
    expect(parseNumberOrNull('abc')).toBeNull();
  });

  it('parses numeric strings', () => {
    expect(parseNumberOrNull('42')).toBe(42);
  });
});

describe('parseDateOrNull', () => {
  it('returns null for empty/invalid dates', () => {
    expect(parseDateOrNull('')).toBeNull();
    expect(parseDateOrNull(undefined)).toBeNull();
    expect(parseDateOrNull('not-a-date')).toBeNull();
  });

  it('parses a valid date to ISO', () => {
    expect(parseDateOrNull('2024-01-05')).toBe(new Date('2024-01-05').toISOString());
  });
});

describe('parseInventoryCsv', () => {
  it('maps a real header row + sample row to InventoryPart fields, dropping legacy/system columns', () => {
    const row =
      'A-1-4,Good,2024-01-05,3,PHOTO-ID-1,7,NDPARTS - Williston Parts,LEGACY-100,,No,Yes,No,Caterpillar,Sample note,PHOTO-BLOB,Sample part,http://legacy/photo.jpg,5,SKU1000,1,0,0,0,1,BU1,Item,/path';
    const csv = `${HEADER}\n${row}`;

    const rows = parseInventoryCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sku: 'SKU1000',
      description: 'Sample part',
      manufacturer: 'Caterpillar',
      inventorySite: 'NDPARTS - Williston Parts',
      binLocation: 'A-1-4',
      qoh: 5,
      confirmedQoh: 3,
      boxCondition: 'Good',
      notes: 'Sample note',
      itemListed: false,
      transferredToMarketRecovery: false,
      legacyPartId: 'LEGACY-100',
      importSequenceNumber: 7,
    });

    // Legacy photo columns and Dataverse/SharePoint system metadata never surface on the mapped row.
    expect(rows[0]).not.toHaveProperty('photoUrls');
    expect(rows[0]).not.toHaveProperty('partPhotographs');
    expect(rows[0]).not.toHaveProperty('statusCode');
    expect(rows[0]).not.toHaveProperty('photographed');
  });

  it('skips rows without a SKU', () => {
    const row = ',,,,,,,,,,,,,,,,,,,,,,,,,,';
    const csv = `${HEADER}\n${row}`;
    expect(parseInventoryCsv(csv)).toHaveLength(0);
  });
});
