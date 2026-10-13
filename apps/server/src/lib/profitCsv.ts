import { parse } from 'csv-parse/sync';
import { averageUnitCost } from '@warehouse/shared';

/**
 * A district's eBay pool as PROFIT exports it: one row per SKU per site.
 *
 *   SkuSiteKey_PQ, sku, part sku, InvSite, PartBin, manufacturer,
 *   Sum of Current Qty, Sum of Current Value Local
 *
 * "part sku" is in fact the description. "Sum of Current Value Local" is the total value of
 * the row's quantity, not a unit price, so it is turned into an average cost per unit.
 */

export interface ProfitRow {
  sourceKey: string;
  sku: string;
  description: string;
  manufacturer: string;
  originSite: string;
  originBin: string;
  qty: number;
  unitCost: number | null;
}

/** "$1,379" → 1379; anything unreadable → null. */
export function parseMoney(value: string | undefined): number | null {
  const cleaned = (value ?? '').replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned.replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(n) ? n : null;
}

/** Headers trimmed and lower-cased, since the export pads some ("InvSite "). */
const norm = (h: string) => h.replace(/^﻿/, '').trim().toLowerCase();

export function isProfitExport(text: string): boolean {
  const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  const headers = first.split(',').map(norm);
  return headers.includes('invsite') && headers.includes('sum of current qty');
}

export function parseProfitCsv(text: string): ProfitRow[] {
  const records: Record<string, string>[] = parse(text.replace(/^﻿/, ''), {
    columns: (headers: string[]) => headers.map(norm),
    skip_empty_lines: true,
    relax_column_count: true,
  });
  return records.flatMap((r) => {
    const sku = (r['sku'] ?? '').trim();
    if (!sku) return [];
    const originSite = (r['invsite'] ?? '').trim();
    const qty = Number((r['sum of current qty'] ?? '').replace(/,/g, '')) || 0;
    return [
      {
        sourceKey: (r['skusitekey_pq'] ?? '').trim() || `${sku}|${originSite}`,
        sku,
        description: (r['part sku'] ?? '').trim(),
        manufacturer: (r['manufacturer'] ?? '').trim(),
        originSite,
        originBin: (r['partbin'] ?? '').trim(),
        qty,
        unitCost: averageUnitCost(parseMoney(r['sum of current value local']), qty),
      },
    ];
  });
}
