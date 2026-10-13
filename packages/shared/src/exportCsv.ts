import { getDiscrepancy } from './discrepancy.js';
import { formatDate } from './dashboardStats.js';
import type { InventoryPart } from './types.js';

/**
 * The inventory spreadsheet: the server's full export and the board's export of what is on
 * screen write the same columns, so the two files line up.
 */

/**
 * One row per record rather than per SKU. The app groups duplicate SKUs for working
 * purposes, but an export is the underlying truth — every site/bin row stays its own line
 * so nothing is flattened away.
 */
const COLUMNS: { header: string; value: (p: InventoryPart) => unknown }[] = [
  { header: 'SKU', value: (p) => p.sku },
  { header: 'Description', value: (p) => p.description },
  { header: 'Manufacturer', value: (p) => p.manufacturer },
  { header: 'Inventory Site', value: (p) => p.inventorySite },
  { header: 'Bin Location', value: (p) => p.binLocation },
  { header: 'Recovery Bin', value: (p) => p.newBinLocation },
  { header: 'System QOH', value: (p) => p.qoh },
  { header: 'Confirmed QOH', value: (p) => p.confirmedQoh },
  { header: 'Variance', value: (p) => getDiscrepancy(p)?.variance ?? '' },
  { header: 'Discrepancy', value: (p) => {
      const d = getDiscrepancy(p);
      return d && d.kind !== 'none' ? d.kind : '';
    } },
  { header: 'Workflow Status', value: (p) => p.workflowStatus },
  { header: 'Photographed', value: (p) => p.photographed },
  { header: 'Photo Count', value: (p) => p.photos?.length ?? 0 },
  { header: 'Item Condition', value: (p) => p.itemCondition },
  { header: 'Box Condition', value: (p) => p.boxCondition },
  { header: 'Needs Review', value: (p) => p.needsReview === true },
  { header: 'Needs Review Note', value: (p) => p.needsReviewNote },
  { header: 'Exception Reason', value: (p) => p.disposition },
  { header: 'Exception Notes', value: (p) => p.dispositionNote },
  { header: 'Notes', value: (p) => p.notes },
  { header: 'Transferred To Market Recovery', value: (p) => p.transferredToMarketRecovery },
  { header: 'Transfer ID', value: (p) => p.transferId },
  { header: 'Item Listed', value: (p) => p.itemListed },
  { header: 'Item Listed Date', value: (p) => formatDate(p.itemListedDate) },
  { header: 'eBay Listing ID', value: (p) => p.ebayListingId },
  { header: 'Revenue Priority Rank', value: (p) => p.revenuePriorityRank },
  { header: 'Field Review Priority', value: (p) => p.fieldReviewPriority },
  { header: 'Active Recovery Price Basis', value: (p) => p.activeRecoveryPriceBasis },
  { header: 'Expected Gross Recovery Margin', value: (p) => p.expectedGrossRecoveryMargin },
  { header: 'Gross Margin Status', value: (p) => p.grossMarginStatus },
  { header: 'Updated At', value: (p) => formatDate(p.updatedAt) },
  { header: 'Part ID', value: (p) => p.id },
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  // Numbers are written bare so quantities and variances stay numeric in Excel — the
  // formula guard below would turn a -4 variance into the text "'-4" and break totalling.
  if (typeof value === 'number') return String(value);
  const s = String(value);
  // A leading =, +, - or @ makes Excel treat the cell as a formula. Prefixing with a
  // single quote keeps part numbers like "-500A" as text instead of a #NAME? error.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The inventory as a CSV, one row per record, in the order given. */
export function inventoryCsv(parts: InventoryPart[]): string {
  const lines = [COLUMNS.map((c) => csvCell(c.header)).join(',')];
  for (const p of parts) lines.push(COLUMNS.map((c) => csvCell(c.value(p))).join(','));
  return lines.join('\r\n');
}

/**
 * Excel assumes the system codepage unless a UTF-8 BOM says otherwise, which mangles any
 * accented or symbol characters in a description.
 */
export const CSV_BOM = '\uFEFF';
