import { describe, expect, it } from 'vitest';
import { mapRowToPart } from './sheetsService.js';

const HEADERS = [
  'sku',
  'description',
  'manufacturer',
  'inventorySite',
  'binLocation',
  'qoh',
  'confirmedQoh',
  'notes',
  'boxCondition',
  'photographed',
  'itemListed',
  'itemListedDate',
  'transferredToMarketRecovery',
  'catalogingStartDate',
  'legacyPartId',
  'importSequenceNumber',
  'updatedAt',
];

const ROW = [
  'SKU1000',
  'Sample part',
  'Caterpillar',
  'NDPARTS - Williston Parts',
  'A-1-4',
  5,
  3,
  'Sample note',
  'Good',
  'FALSE',
  'FALSE',
  '',
  'TRUE',
  '2024-01-05',
  'LEGACY-100',
  7,
  '2024-01-06T00:00:00.000Z',
];

describe('mapRowToPart', () => {
  it('maps a full row to InventoryPart fields', () => {
    const part = mapRowToPart(HEADERS, ROW, []);
    expect(part).toMatchObject({
      id: 'SKU1000',
      sku: 'SKU1000',
      description: 'Sample part',
      manufacturer: 'Caterpillar',
      inventorySite: 'NDPARTS - Williston Parts',
      binLocation: 'A-1-4',
      qoh: 5,
      confirmedQoh: 3,
      notes: 'Sample note',
      boxCondition: 'Good',
      photographed: false,
      itemListed: false,
      transferredToMarketRecovery: true,
      legacyPartId: 'LEGACY-100',
      importSequenceNumber: 7,
      workflowStatus: 'Processing',
    });
  });

  it('is independent of column order', () => {
    const shuffledHeaders = [...HEADERS].reverse();
    const shuffledRow = [...ROW].reverse();
    const part = mapRowToPart(shuffledHeaders, shuffledRow, []);
    expect(part.sku).toBe('SKU1000');
    expect(part.confirmedQoh).toBe(3);
    expect(part.transferredToMarketRecovery).toBe(true);
  });

  it('handles native (non-string) cell values the Sheets API may return', () => {
    const row = [...ROW];
    row[HEADERS.indexOf('qoh')] = 5; // number
    row[HEADERS.indexOf('transferredToMarketRecovery')] = true; // boolean
    const part = mapRowToPart(HEADERS, row, []);
    expect(part.qoh).toBe(5);
    expect(part.transferredToMarketRecovery).toBe(true);
  });

  it('treats photos.length > 0 as photographed even if the cell says false', () => {
    const part = mapRowToPart(HEADERS, ROW, [{ fileName: 'a.jpg', url: '', uploadedAt: '' }]);
    expect(part.photographed).toBe(true);
  });

  it('is Completed when all five checkpoints are set', () => {
    const row = [...ROW];
    row[HEADERS.indexOf('photographed')] = 'TRUE';
    row[HEADERS.indexOf('itemListed')] = 'TRUE';
    const part = mapRowToPart(HEADERS, row, []);
    expect(part.workflowStatus).toBe('Completed');
  });
});
