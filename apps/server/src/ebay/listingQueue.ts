import {
  coerceAgentListing,
  draftReadiness,
  suggestShipping,
  type ShippingChoice,
  groupPartsBySku,
  listingProblems,
  scheduleProblem,
  type AgentListing,
  type PartGroup,
  type PolicyChoice,
  type SellerPolicy,
} from '@warehouse/shared';
import { getAllParts, updatePart } from '../google/sheetsService.js';
import { HttpError, prepareListing } from './listingPrep.js';
import { getSellerSetup, publishListing, resolveCategory, suggestCategories, verifyListing } from './publishService.js';
import { SITE_MOTORS } from './trading.js';
import { researchedSkus } from './researchBatch.js';
import { latestResearch } from './researchService.js';

/**
 * Listing a steady number of parts a day without anyone scheduling them one at a time.
 *
 * eBay holds a scheduled listing until its start time, so a week's worth goes out in one
 * sitting and nothing here has to keep running — which matters on a host that sleeps.
 * SPARE proposes the parts; a person approves the batch; only then is anything sent.
 */

export interface PlannedListing {
  partId: string;
  sku: string;
  title: string;
  price: number | null;
  quantity: number;
  photos: number;
  condition: string;
  /** When this one would go live. */
  startAt: string;
  /** Anything about the listing that would stop it, for the person reviewing. */
  problems: string[];
  listing: AgentListing;
  /** The category as resolved, so a reviewer can see and change it here. */
  categoryId: string;
  categoryName: string | null;
  /** True when the category sits under eBay Motors, which decides the returns policy. */
  motors: boolean;
  /** Free postage or charged, suggested from the agent's weight and the price. */
  shipping: ShippingChoice;
  policies: PolicyChoice;
}

/** The account's policies as the queue uses them: named once, chosen per listing. */
export interface QueuePolicies {
  freeShipping: SellerPolicy | null;
  paidShipping: SellerPolicy | null;
  motorsReturns: SellerPolicy | null;
  noReturns: SellerPolicy | null;
  payment: SellerPolicy | null;
}

const byName = (list: SellerPolicy[], match: RegExp) => list.find((p) => match.test(p.name)) ?? null;

/**
 * Which of the account's policies the queue picks from. Matched by name rather than
 * configured, so the team can rename or replace one in Seller Hub and SPARE follows —
 * the same reason the rest of the seller setup is read from their live listings.
 *
 * Copies are ignored: "Free Shipping Copy" is a duplicate nobody meant to list under.
 */
export async function queuePolicies(): Promise<QueuePolicies> {
  const setup = await getSellerSetup();
  const original = (list: SellerPolicy[]) => list.filter((p) => !/\bcopy\b/i.test(p.name));
  const shipping = original(setup.shipping);
  const returns = original(setup.returns);
  const payment = original(setup.payment);
  const paidDefault = shipping.find((p) => p.id === setup.defaults.shipping);

  return {
    freeShipping: byName(shipping, /^free shipping/i),
    // Whatever the team's listings already use, as long as it isn't the free one.
    paidShipping: paidDefault && !/^free shipping/i.test(paidDefault.name) ? paidDefault : byName(shipping, /calculated|fedex|ups|usps/i),
    motorsReturns: byName(returns, /motors/i),
    noReturns: byName(returns, /^no returns/i),
    payment: payment.find((p) => p.id === setup.defaults.payment) ?? payment[0] ?? null,
  };
}

/**
 * The policies for one listing: Motors parts take returns because eBay Motors buyers
 * expect them, everything else goes out as no returns, and postage follows the weight.
 */
export function policiesFor(all: QueuePolicies, motors: boolean, shipping: ShippingChoice): PolicyChoice {
  const ship = shipping === 'free' ? all.freeShipping ?? all.paidShipping : all.paidShipping ?? all.freeShipping;
  const back = motors ? all.motorsReturns ?? all.noReturns : all.noReturns ?? all.motorsReturns;
  return { shipping: ship?.id ?? '', returns: back?.id ?? '', payment: all.payment?.id ?? '' };
}

export interface QueuePlan {
  items: PlannedListing[];
  /** The policies a reviewer can switch between, so the screen can relabel without asking. */
  policyOptions: QueuePolicies;
  /** Ready to list and researched, but beyond what this plan covers. */
  remaining: number;
  /** Ready to list with no research yet, so not eligible. */
  unresearched: number;
}

export interface QueueStatus {
  running: boolean;
  total: number;
  scheduled: number;
  failed: { sku: string; error: string }[];
  current: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  startedBy: string | null;
}

const state: QueueStatus = {
  running: false,
  total: 0,
  scheduled: 0,
  failed: [],
  current: null,
  startedAt: null,
  finishedAt: null,
  startedBy: null,
};

export function queueStatus(): QueueStatus {
  return { ...state, failed: [...state.failed] };
}

/** eBay's own ceiling, and the most a day's work can reasonably carry. */
export const MAX_DAYS = 21;
export const MAX_PER_DAY = 25;

/** The start time for the nth listing of a day: spread through the hour, not all at once. */
function startFor(day: Date, hour: number, indexInDay: number, perDay: number): Date {
  const at = new Date(day);
  at.setHours(hour, 0, 0, 0);
  // Minutes apart, so a buyer watching the store doesn't see fifty appear in one second.
  const gap = Math.floor(60 / Math.max(perDay, 1));
  at.setMinutes(indexInDay * gap);
  return at;
}

/**
 * The agent names a category by path; eBay needs its number. The one-at-a-time publisher
 * leaves that choice on screen, which a batch has nobody to ask — so the top suggestion is
 * taken when it is a leaf and clearly ahead of the next, exactly the rule the screen uses
 * to pick for itself. Anything less certain is left for the reviewer to see as a problem.
 */
async function withCategory(listing: AgentListing): Promise<AgentListing> {
  if (listing.categoryId) return listing;
  const suggestions = await suggestCategories(
    listing.titleOptions[0] ?? listing.title,
    listing.categoryPath ?? ''
  ).catch(() => []);
  const [top, next] = suggestions;
  if (!top?.leafMatch || (next?.score ?? -1) >= top.score) return listing;
  return { ...listing, categoryId: top.id, categoryName: top.name };
}

/**
 * The parts to list, best first. Revenue priority decides, since that is the ranking the
 * business already put on the catalogue; ties go to the part carried at the higher value.
 */
function candidates(groups: PartGroup[]): PartGroup[] {
  return groups
    .filter((g) => draftReadiness(g).ready)
    .sort((a, b) => {
      const rank = (g: PartGroup) => g.revenuePriorityRank ?? Number.MAX_SAFE_INTEGER;
      return rank(a) - rank(b) || (b.activeRecoveryPriceBasis ?? 0) - (a.activeRecoveryPriceBasis ?? 0);
    });
}

/**
 * What SPARE proposes to list: `perDay` parts a day for `days` days, starting tomorrow at
 * `hour`. Only parts Copilot has already researched are eligible, since a listing needs a
 * title, a price and a category from somewhere.
 */
export async function buildPlan(
  days: number,
  perDay: number,
  hour: number,
  now: Date = new Date()
): Promise<QueuePlan> {
  const [all, researched, policies] = await Promise.all([
    getAllParts().then((parts) => candidates(groupPartsBySku(parts))),
    researchedSkus(),
    queuePolicies(),
  ]);
  // One listing of the research folder decides who is eligible, rather than a Drive lookup
  // for every part in the catalogue: with a long backlog that was hundreds of calls to
  // find a handful of listings.
  const has = (g: PartGroup) => researched.has(g.sku.trim().toLowerCase());
  const groups = all.filter(has);
  const unresearched = all.length - groups.length;
  const wanted = days * perDay;
  const items: PlannedListing[] = [];
  let seen = 0;

  for (const group of groups) {
    if (items.length >= wanted) break;
    seen += 1;
    const research = await latestResearch(group.sku).catch(() => null);
    // Coerced, because a research file is whatever the agent wrote: a missing field should
    // show up as a problem to fix, not throw while the plan is being built.
    // Listed in the folder but unreadable — a half-written file, or one the agent left
    // empty. Not a candidate, and not worth stopping the plan for.
    const found = research?.listing ? coerceAgentListing(research.listing) : null;
    if (!found) continue;
    const parsed = await withCategory(found);
    // Motors decides the returns policy, so the category has to be resolved either way.
    const category = parsed.categoryId ? await resolveCategory(parsed.categoryId).catch(() => null) : null;
    const motors = category?.siteId === SITE_MOTORS;
    const shipping = suggestShipping(parsed);

    const index = items.length;
    const day = new Date(now);
    // Tomorrow at the earliest: today's hour may already have passed, and eBay wants an
    // hour's notice regardless.
    day.setDate(day.getDate() + 1 + Math.floor(index / perDay));
    const startAt = startFor(day, hour, index % perDay, perDay);

    items.push({
      partId: group.primary.id,
      sku: group.sku,
      title: parsed.title,
      price: parsed.price ?? null,
      quantity: group.confirmedQoh ?? group.stockQty,
      photos: group.photos.length,
      condition: group.itemCondition ?? '',
      startAt: startAt.toISOString(),
      problems: listingProblems(parsed),
      listing: parsed,
      categoryId: parsed.categoryId,
      categoryName: category?.name ?? parsed.categoryName ?? null,
      motors,
      shipping,
      policies: policiesFor(policies, motors, shipping),
    });
  }

  return { items, policyOptions: policies, remaining: Math.max(0, groups.length - seen), unresearched };
}

export interface QueueItem {
  partId: string;
  startAt: string;
  listing: AgentListing;
  /** Chosen per listing, since returns follow the category and postage the weight. */
  policies: PolicyChoice;
}

async function run(items: QueueItem[]): Promise<void> {
  // One read of the sheet for the whole batch rather than one per listing.
  const groups = groupPartsBySku(await getAllParts());

  for (const item of items) {
    if (!state.running) break;
    state.current = item.partId;
    try {
      const { group, input, problems } = await prepareListing(
        item.partId,
        { listing: item.listing, policies: item.policies, scheduleTime: item.startAt },
        groups
      );
      if (problems.length) throw new HttpError(422, problems.join(' '));

      // eBay's own verdict before anything is created, so a listing it would reject drops
      // out of the batch instead of failing halfway through.
      const check = await verifyListing(input);
      if (!check.ok) {
        throw new HttpError(422, check.messages.map((m) => m.message).join(' ') || 'eBay would not accept it.');
      }

      const listed = await publishListing(input);
      state.scheduled += 1;
      await updatePart(
        group.primary.id,
        { ebayListingId: listed.itemId, itemListed: true, itemListedDate: item.startAt },
        state.startedBy ?? undefined
      ).catch(() => undefined);
    } catch (err) {
      state.failed.push({
        sku: groups.find((g) => g.records.some((r) => r.id === item.partId))?.sku ?? item.partId,
        error: err instanceof Error ? err.message : 'Scheduling failed',
      });
    }
  }

  state.running = false;
  state.current = null;
  state.finishedAt = new Date().toISOString();
}

/** Schedules an approved batch. Returns once the run has started, not when it finishes. */
export async function startQueue(items: QueueItem[], who: string): Promise<QueueStatus> {
  if (state.running) throw new HttpError(409, 'A batch is already being scheduled.');
  if (!items.length) throw new HttpError(400, 'Nothing to schedule.');
  for (const item of items) {
    const problem = scheduleProblem(item.startAt);
    if (problem) throw new HttpError(400, `${problem} (${item.partId})`);
  }

  Object.assign(state, {
    running: true,
    total: items.length,
    scheduled: 0,
    failed: [],
    current: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    startedBy: who,
  } satisfies QueueStatus);

  void run(items);
  return queueStatus();
}

export function stopQueue(): QueueStatus {
  state.running = false;
  return queueStatus();
}
