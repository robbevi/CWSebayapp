import { parse } from 'csv-parse/sync';

export interface ImportRow {
  sku: string;
  description?: string;
  manufacturer?: string;
  inventorySite?: string;
  binLocation?: string;
  qoh?: number;
  confirmedQoh?: number | null;
  boxCondition?: string;
  notes?: string;
  itemListed?: boolean;
  itemListedDate?: string | null;
  transferredToMarketRecovery?: boolean;
  catalogingStartDate?: string | null;
  legacyPartId?: string;
  importSequenceNumber?: number | null;
}

const TRUE_VALUES = new Set(['true', 'yes', 'y', '1']);

export function parseBoolean(value: string | undefined): boolean {
  if (value === undefined) return false;
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

export function parseNumberOrNull(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function parseDateOrNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Photos are intentionally never imported from the legacy CSV (Part Photographs,
 * Part Photographs ID, Photo URLs are dropped) — every imported part starts unphotographed
 * until staff capture a real photo in-app.
 */
export function parseInventoryCsv(csvText: string): ImportRow[] {
  const records: Record<string, string>[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  return records
    .map((row): ImportRow | null => {
      const sku = row['SKU']?.trim();
      if (!sku) return null;
      return {
        sku,
        description: row['Part Description']?.trim() || undefined,
        manufacturer: row['Manufacturer Name']?.trim() || undefined,
        inventorySite: row['Inventory Site']?.trim() || undefined,
        binLocation: row['Bin Location']?.trim() || undefined,
        qoh: parseNumberOrNull(row['Quantity On Hand']) ?? 0,
        confirmedQoh: parseNumberOrNull(row['Confirmed Quantity On Hand']),
        boxCondition: row['Box Condition']?.trim() || undefined,
        notes: row['Notes']?.trim() || undefined,
        itemListed: parseBoolean(row['Item Listed']),
        itemListedDate: parseDateOrNull(row['Item Listed Date']),
        transferredToMarketRecovery: parseBoolean(row['Transferred To Market Recovery']),
        catalogingStartDate: parseDateOrNull(row['Cataloging Start Date']),
        legacyPartId: row['Inventory Part ID']?.trim() || undefined,
        importSequenceNumber: parseNumberOrNull(row['Import Sequence Number']),
      };
    })
    .filter((r): r is ImportRow => r !== null);
}
