/**
 * Imports an eBay Orders Report CSV into the Sales tab.
 *
 *   npx tsx scripts/import-ebay-orders.ts "<path to csv>"           dry run
 *   npx tsx scripts/import-ebay-orders.ts "<path to csv>" --apply   writes
 *
 * The API only reaches back so far and only sees what the granted account can see, so a
 * downloaded report is the way to bring in history — including sales made before any of
 * these parts were in the app.
 *
 * Keyed on eBay's Transaction ID, the same identity the live sync uses for a line item,
 * so importing a report and then syncing cannot double-count the same sale.
 */
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import type { Sale } from '@warehouse/shared';
import { upsertSales } from '../src/google/sheetsService.js';

// The report carries no fee columns, so fees are estimated at eBay's rough US rate and
// flagged as such. A later live sync replaces them with the real figures.
const ESTIMATED_FEE_RATE = 0.1325;

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** "Aug-20-26" -> "2026-08-20T00:00:00.000Z". The report has no time of day. */
function parseSaleDate(value: string): string | null {
  const m = /^([A-Za-z]{3})-(\d{1,2})-(\d{2,4})$/.exec(value.trim());
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  const day = m[2].padStart(2, '0');
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${month}-${day}T00:00:00.000Z`;
}

/** "$1,260.00" -> 1260. Blank and "--" both mean zero. */
function money(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value.replace(/[$,]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function rowToSale(row: Record<string, string>, syncedAt: string): Sale | { skipped: string } {
  const orderId = (row['Order Number'] ?? '').trim();
  const lineItemId = (row['Transaction ID'] ?? '').trim();
  if (!orderId || !lineItemId) return { skipped: 'no order or transaction id' };

  const soldAt = parseSaleDate(row['Sale Date'] ?? '');
  if (!soldAt) return { skipped: `unparseable sale date "${row['Sale Date']}"` };

  const qtySold = Number(row['Quantity'] ?? '0') || 0;
  // "Sold For" is the price of one unit; the report's Total Price is unit x qty plus
  // shipping and tax, which is how this was verified against the file.
  const unitPrice = money(row['Sold For']);
  const grossSale = round2(unitPrice * qtySold);
  const shipping = money(row['Shipping And Handling']);
  const tax = money(row['eBay Collected Tax']);
  const fees = round2((grossSale + shipping) * ESTIMATED_FEE_RATE);

  return {
    lineItemId,
    orderId,
    soldAt,
    ebayListingId: (row['Item Number'] ?? '').trim(),
    sku: (row['Custom Label'] ?? '').trim(),
    qtySold,
    grossSale,
    shipping,
    tax,
    fees,
    netProceeds: round2(grossSale + shipping - fees),
    currency: 'USD',
    feesEstimated: true,
    syncedAt,
  };
}

async function main() {
  const path = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!path) {
    console.error('\nUsage: npx tsx scripts/import-ebay-orders.ts "<path to csv>" [--apply]\n');
    process.exit(1);
  }

  // The report opens with a spacer line before the real header row.
  const text = readFileSync(path, 'utf-8');
  const rows = parse(text, {
    columns: true,
    from_line: 2,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
  }) as Record<string, string>[];

  const syncedAt = new Date().toISOString();
  const sales: Sale[] = [];
  const skipped: string[] = [];

  for (const row of rows) {
    const result = rowToSale(row, syncedAt);
    if ('skipped' in result) {
      const label = (row['Order Number'] ?? '').trim() || '(blank row)';
      // The footer lines ("10 record(s) downloaded", "Seller ID : ...") land here too.
      if (label !== '(blank row)') skipped.push(`${label}: ${result.skipped}`);
      continue;
    }
    sales.push(result);
  }

  console.log(`\nParsed ${sales.length} sold line item(s) from ${rows.length} row(s).`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length}:`);
    for (const s of skipped) console.log(`   ${s}`);
  }

  console.log('\n  date        listing        sku                  qty     gross   ship     net');
  let gross = 0;
  let net = 0;
  let units = 0;
  for (const s of sales.sort((a, b) => a.soldAt.localeCompare(b.soldAt))) {
    gross += s.grossSale;
    net += s.netProceeds;
    units += s.qtySold;
    console.log(
      `  ${s.soldAt.slice(0, 10)}  ${s.ebayListingId.padEnd(13)}  ${(s.sku || '—').slice(0, 19).padEnd(19)} ` +
        `${String(s.qtySold).padStart(3)}  ${s.grossSale.toFixed(2).padStart(8)} ` +
        `${s.shipping.toFixed(2).padStart(6)} ${s.netProceeds.toFixed(2).padStart(8)}`
    );
  }
  console.log(
    `\n  ${units} unit(s)   gross $${gross.toFixed(2)}   net $${net.toFixed(2)} (fees estimated)\n`
  );

  if (!apply) {
    console.log('Dry run. Re-run with --apply to write these to the Sales tab.\n');
    return;
  }

  const result = await upsertSales(sales);
  console.log(
    `Wrote to the Sales tab: ${result.added} added, ${result.updated} updated, ${result.unchanged} unchanged.\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
