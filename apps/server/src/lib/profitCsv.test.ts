import { describe, expect, it } from 'vitest';
import { isProfitExport, parseMoney, parseProfitCsv } from './profitCsv.js';

const FILE = `﻿SkuSiteKey_PQ,sku,part sku,InvSite ,PartBin,manufacturer,Sum of Current Qty,Sum of Current Value Local
0002-3115|EXPGJPT,0002-3115,FUEL TANK STRAP PAD/HDWR KIT (PROPELL),EXPGJPT,J-1-2,Not Available,6,$1379
236577BXW|GJPARTS,236577BXW,"COOLER, BASCO TUBE & SHELL",GJPARTS,IB-7-3,API Heat Transfer,26,$3
NOVAL|GJPARTS,NOVAL,THING,GJPARTS,A-1,Acme,0,$0
,,blank row,GJPARTS,,,1,$1
`;

describe('the PROFIT export', () => {
  it('is told apart from the regular import', () => {
    expect(isProfitExport(FILE)).toBe(true);
    expect(isProfitExport('SKU,Part Description,Quantity On Hand\n')).toBe(false);
  });

  it('reads each row, with the description from "part sku"', () => {
    const [first] = parseProfitCsv(FILE);
    expect(first).toEqual({
      sourceKey: '0002-3115|EXPGJPT',
      sku: '0002-3115',
      description: 'FUEL TANK STRAP PAD/HDWR KIT (PROPELL)',
      manufacturer: 'Not Available',
      originSite: 'EXPGJPT',
      originBin: 'J-1-2',
      qty: 6,
      unitCost: 229.83,
    });
  });

  it('turns the total value into an average cost per unit', () => {
    const row = parseProfitCsv(FILE).find((r) => r.sku === '236577BXW')!;
    expect(row.qty).toBe(26);
    expect(row.unitCost).toBe(0.12);
    expect(row.description).toBe('COOLER, BASCO TUBE & SHELL');
  });

  it('gives no unit cost to a row with no quantity, and skips rows with no SKU', () => {
    const rows = parseProfitCsv(FILE);
    expect(rows.find((r) => r.sku === 'NOVAL')!.unitCost).toBeNull();
    expect(rows).toHaveLength(3);
  });

  it('reads money as PROFIT writes it', () => {
    expect(parseMoney('$1,379')).toBe(1379);
    expect(parseMoney('($12)')).toBe(-12);
    expect(parseMoney('')).toBeNull();
  });
});
