/**
 * Publishes a listing already reviewed in SPARE's panel, from its saved draft JSON.
 *
 *   npx tsx scripts/publish-reviewed-listing.ts <draft.json> <sku> [--schedule-days N] [--go]
 *
 * Without --go it only validates. With --schedule-days, the listing is created to start N
 * days from now and waits under Scheduled in Seller Hub, where it can be reviewed first;
 * if eBay would charge to schedule, or refuses it, it is validated and published now instead.
 */
import fs from 'node:fs';
import {
  coerceAgentListing,
  fillFromPart,
  groupPartsBySku,
  listingProblems,
  researchMismatch,
  tradingCondition,
  type PolicyChoice,
} from '@warehouse/shared';
import { env } from '../src/config/env.js';
import { getSellerSetup, publishListing, verifyListing, type PublishInput } from '../src/ebay/publishService.js';
import { getAllParts, updatePart } from '../src/google/sheetsService.js';

const [file, sku] = process.argv.slice(2);
const go = process.argv.includes('--go');
const daysArg = process.argv.indexOf('--schedule-days');
const scheduleDays = daysArg !== -1 ? Number(process.argv[daysArg + 1]) : 0;
const SUBMITTED_BY = 'Rob Bevilacqua';
const PHOTO_BASE = env.publicBaseUrl ?? 'https://calfracusebayinventoryapp.onrender.com';

const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as { draft: unknown; policies: PolicyChoice };
const group = groupPartsBySku(await getAllParts()).find((g) => g.sku === sku);
if (!group) throw new Error(`No part ${sku}`);
if (group.records.some((r) => r.ebayListingId || r.itemListed)) throw new Error(`${sku} is already listed.`);

const condition = tradingCondition(group.itemCondition);
if (!condition) throw new Error(`No eBay condition for "${group.itemCondition}"`);
const listing = fillFromPart(coerceAgentListing(saved.draft), group);
const problems = [...listingProblems(listing), researchMismatch(listing, group.sku)].filter(Boolean);
if (problems.length) throw new Error(problems.join(' '));

const setup = await getSellerSetup();
const base: PublishInput = {
  listing,
  sku: group.sku,
  quantity: group.confirmedQoh ?? group.stockQty,
  conditionId: condition.id,
  imageUrls: group.photos.slice(0, 24).map((p) => `${PHOTO_BASE}${p.url}`),
  policies: saved.policies,
  shipFrom: setup.shipFrom!,
};

const name = (list: { id: string; name: string }[], id: string) => list.find((p) => p.id === id)?.name ?? id;
console.log(`\n${group.sku}  "${listing.title}"`);
console.log(`  condition ${condition.label} (${condition.id}), qty ${base.quantity}, $${listing.price}, ${base.imageUrls.length} photo(s), category ${listing.categoryId}`);
console.log(`  policies: ${name(setup.shipping, base.policies.shipping)} | ${name(setup.returns, base.policies.returns)} | ${name(setup.payment, base.policies.payment)}`);

const report = (label: string, v: Awaited<ReturnType<typeof verifyListing>>) => {
  console.log(`\n${label}: ${v.ok ? 'ACCEPTED' : 'REJECTED'}  fees: ${v.fees.map((f) => `${f.name} $${f.amount}`).join(', ') || 'none'}`);
  for (const m of v.messages) console.log(`  ${m.severity}: ${m.message.slice(0, 200)}`);
  for (const s of v.missingSpecifics) console.log(`  missing specific: ${s}`);
};

let input = base;
if (scheduleDays > 0) {
  const start = new Date(Date.now() + scheduleDays * 86_400_000);
  start.setUTCHours(15, 0, 0, 0); // 10:00 in Williston
  const scheduled = { ...base, scheduleTime: start.toISOString() };
  const v = await verifyListing(scheduled);
  report(`Scheduled for ${scheduled.scheduleTime}`, v);
  if (v.ok && v.fees.length === 0) input = scheduled;
  else console.log('  -> scheduling not used; falling back to publishing now');
}
if (!input.scheduleTime) {
  const v = await verifyListing(base);
  report('Publish now', v);
  if (!v.ok) throw new Error('eBay would reject this listing; nothing published.');
}

if (!go) {
  console.log('\nValidated only. Re-run with --go to create it.\n');
  process.exit(0);
}

const result = await publishListing(input);
console.log(`\nCREATED item ${result.itemId}  ${result.url}${input.scheduleTime ? `  (starts ${input.scheduleTime})` : ''}`);
for (const m of result.messages.filter((m) => m.severity !== 'info')) console.log(`  ${m.severity}: ${m.message.slice(0, 200)}`);

await updatePart(
  group.primary.id,
  { ebayListingId: result.itemId, itemListed: true, itemListedDate: input.scheduleTime ?? new Date().toISOString() },
  SUBMITTED_BY
);
console.log(`Recorded on ${group.sku}: listing ${result.itemId}\n`);
