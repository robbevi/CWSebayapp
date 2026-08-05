/**
 * Seeds the Discrepancies log from counts that were already recorded before the log
 * existed.
 *
 *   npx tsx scripts/backfill-discrepancies.ts          # dry run
 *   npx tsx scripts/backfill-discrepancies.ts --apply
 *
 * Append-only, and skips any SKU already present in the log, so it is safe to re-run.
 */
import { getDiscrepancy } from '@warehouse/shared';
import { getAllParts, getDiscrepancyLog, getSubmissions, appendDiscrepancies } from '../src/google/sheetsService.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  const [parts, existing, submissions] = await Promise.all([getAllParts(), getDiscrepancyLog(), getSubmissions()]);

  const alreadyLogged = new Set(existing.map((e) => `${e.sku.toUpperCase()}|${e.inventorySite.toUpperCase()}`));

  // Best-effort attribution: whoever completed this SKU is overwhelmingly the person who
  // counted it. Anything without a submission is marked unattributed rather than guessed.
  const counterFor = new Map<string, string>();
  for (const s of submissions) {
    if (s.role === 'warehouse' && !counterFor.has(s.sku.toUpperCase())) counterFor.set(s.sku.toUpperCase(), s.user);
  }

  const entries = parts
    .map((p) => ({ p, d: getDiscrepancy(p) }))
    .filter(({ p, d }) => d && d.kind !== 'none' && !alreadyLogged.has(`${p.sku.toUpperCase()}|${p.inventorySite.toUpperCase()}`))
    .map(({ p, d }) => ({
      sku: p.sku,
      inventorySite: p.inventorySite,
      binLocation: p.binLocation,
      expectedQoh: p.qoh,
      countedQoh: p.confirmedQoh as number,
      variance: d!.variance,
      kind: d!.kind,
      user: counterFor.get(p.sku.toUpperCase()) ?? 'unattributed (backfilled)',
      // The count itself wasn't timestamped, so the row's last-updated time is the closest
      // honest approximation of when it happened.
      recordedAt: p.updatedAt ?? '',
    }));

  const byKind = entries.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] ?? 0) + 1 }), {});
  const attributed = entries.filter((e) => !e.user.startsWith('unattributed')).length;

  console.log('--- plan ---');
  console.log('parts scanned        :', parts.length);
  console.log('already in log       :', existing.length);
  console.log('to backfill          :', entries.length, byKind);
  console.log('  attributed to user :', attributed);
  console.log('  unattributed       :', entries.length - attributed);
  entries
    .slice()
    .sort((a, b) => a.variance - b.variance)
    .slice(0, 8)
    .forEach((e) => console.log(`   ${e.sku} @ ${e.inventorySite}: ${e.countedQoh}/${e.expectedQoh} = ${e.variance} (${e.kind}) — ${e.user}`));

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.');
    return;
  }
  if (entries.length === 0) return;

  await appendDiscrepancies(entries);
  console.log('\nappended', entries.length, 'rows to the Discrepancies log.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
