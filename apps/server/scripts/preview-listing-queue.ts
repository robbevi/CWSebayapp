/**
 * What a batch would schedule, without scheduling anything. Reads the sheet and the
 * research folder only; nothing reaches eBay.
 *
 *   npx tsx scripts/preview-listing-queue.ts [perDay] [days] [hour]
 */
import { buildPlan } from '../src/ebay/listingQueue.js';

const perDay = Number(process.argv[2] ?? 10);
const days = Number(process.argv[3] ?? 7);
const hour = Number(process.argv[4] ?? 9);

const plan = await buildPlan(days, perDay, hour);
console.log(`${plan.items.length} listings planned — ${plan.remaining} more ready, ${plan.unresearched} unresearched\n`);

let lastDay = '';
for (const item of plan.items) {
  const when = new Date(item.startAt);
  const day = when.toDateString();
  if (day !== lastDay) {
    console.log(`\n${day}`);
    lastDay = day;
  }
  const price = item.price == null ? '—' : `$${item.price.toFixed(2)}`;
  const problems = item.problems.length ? `  !! ${item.problems.join(' ')}` : '';
  const policy = `${item.motors ? 'Motors/returns' : 'no returns'}, ${item.shipping === 'free' ? 'free post' : 'buyer pays'}`;
  const cat = `${item.categoryUncertain ? '? ' : '  '}${(item.categoryName ?? item.categoryId).slice(0, 26)}`;
  console.log(
    `  ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}  ${item.sku.padEnd(18)} ${price.padStart(9)}  qty ${item.quantity}  ${item.photos}ph  ${policy.padEnd(26)} ${cat.padEnd(28)} ${item.title.slice(0, 28)}${problems}`
  );
}
