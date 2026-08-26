/**
 * How much of a listing could the app fill in by itself today?
 *
 *   npx tsx scripts/draft-readiness.ts
 *
 * eBay needs a title, a category, a condition, a price, a quantity and at least one
 * picture before it will take a draft. This counts what is already there so the gaps are
 * known before anything is built on top of them.
 */
import { getCheckpoints, groupPartsBySku } from '@warehouse/shared';
import { getAllParts } from '../src/google/sheetsService.js';

const parts = await getAllParts();
const groups = groupPartsBySku(parts);

// The point at which a user has "finished" a part in the warehouse sense.
const worked = groups.filter((g) => {
  const c = getCheckpoints(g);
  return c.photographed && c.qtyConfirmed && c.conditionSet;
});

const unlisted = worked.filter((g) => !getCheckpoints(g).listed);

console.log(`\nSKUs: ${groups.length}`);
console.log(`Photographed + counted + condition set: ${worked.length}`);
console.log(`  of those, not yet on eBay            : ${unlisted.length}\n`);

function has(g: (typeof groups)[number], field: 'description' | 'manufacturer'): boolean {
  return !!g[field]?.trim();
}

const checks: { label: string; ok: (g: (typeof groups)[number]) => boolean }[] = [
  { label: 'has at least one photo', ok: (g) => g.photos.length > 0 },
  { label: 'has a description (title source)', ok: (g) => has(g, 'description') },
  { label: 'has a manufacturer (brand)', ok: (g) => has(g, 'manufacturer') },
  { label: 'has an item condition', ok: (g) => !!g.itemCondition },
  { label: 'has a box condition', ok: (g) => !!g.boxCondition },
  { label: 'has a price basis', ok: (g) => (g.records.some((r) => r.activeRecoveryPriceBasis != null)) },
  { label: 'has a confirmed quantity', ok: (g) => g.confirmedQoh != null },
];

console.log(`Of the ${unlisted.length} finished-but-unlisted parts:`);
for (const c of checks) {
  const n = unlisted.filter(c.ok).length;
  const pct = unlisted.length ? Math.round((n / unlisted.length) * 100) : 0;
  console.log(`  ${String(n).padStart(4)} / ${unlisted.length}  (${String(pct).padStart(3)}%)  ${c.label}`);
}

const fullyReady = unlisted.filter((g) => checks.every((c) => c.ok(g)));
console.log(`\nCould be drafted with no human input at all: ${fullyReady.length}`);

const missingPriceOnly = unlisted.filter(
  (g) => checks.filter((c) => !c.ok(g)).every((c) => c.label.includes('price'))
);
console.log(`Ready except for a price                  : ${missingPriceOnly.length}\n`);

// What the titles would look like, since that is what actually sells the thing.
console.log('Titles the app could build today (description + manufacturer):');
for (const g of unlisted.slice(0, 8)) {
  const title = [g.manufacturer, g.description, g.sku].filter(Boolean).join(' ').slice(0, 80);
  console.log(`  ${title || '(nothing to build a title from)'}`);
}

// Distinct condition values, to size the mapping onto eBay's own enum.
const itemConditions = new Set(groups.map((g) => g.itemCondition).filter(Boolean));
const boxConditions = new Set(groups.map((g) => g.boxCondition).filter(Boolean));
console.log(`\nItem conditions in use : ${[...itemConditions].join(', ') || 'none'}`);
console.log(`Box conditions in use  : ${[...boxConditions].join(', ') || 'none'}\n`);
