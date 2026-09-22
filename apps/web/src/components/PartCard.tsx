import {
  AlertTriangle,
  ArrowRight,
  DollarSign,
  ExternalLink,
  Factory,
  Flag,
  Sparkles,
  Layers,
  MapPin,
  Package,
  ShoppingCart,
  Wrench,
} from 'lucide-react';
import {
  daysListed,
  formatVariance,
  getGroupDiscrepancy,
  isHighPriority,
  isPositiveMargin,
  listingFor,
  salesForGroup,
  soldPosition,
  type Listing,
  type PartGroup,
  type SalesIndex,
} from '@warehouse/shared';
import { cn } from '../lib/cn';
import { isResearched, useResearchedSkus } from '../hooks/useResearchedSkus';
import { useUIStore } from '../state/useUIStore';
import { Pill } from './ui/Pill';
import { ProcessingStatusChips } from './ProcessingStatusChips';

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

/** One figure from the listing: the number first, what it counts underneath. */
function Stat({ value, label, title, muted }: { value: string; label: string; title: string; muted?: boolean }) {
  return (
    <div className="text-center" title={title}>
      <div className={cn('text-sm font-bold leading-tight tabular-nums', muted ? 'text-textMuted' : 'text-textPri')}>
        {value}
      </div>
      <div className="text-[9px] font-semibold uppercase tracking-wide text-textMuted">{label}</div>
    </div>
  );
}

export function PartCard({
  part,
  salesIndex,
  listingsIndex,
}: {
  part: PartGroup;
  salesIndex: SalesIndex;
  listingsIndex: Map<string, Listing>;
}) {
  const set = useUIStore((s) => s.set);
  const researched = useResearchedSkus();
  const sold = soldPosition(part, salesForGroup(part, salesIndex));
  // What eBay says it is asking, not what the spreadsheet hoped for. The two differ —
  // one belt is listed at $60 against a $44.99 basis — and the live figure is the one
  // that matches the listing.
  const listing = listingFor(part.records, listingsIndex);
  const askingPrice = listing?.price ?? part.activeRecoveryPriceBasis ?? 0;
  const discrepancy = getGroupDiscrepancy(part);
  // A SKU stocked in more than one bin collapses to a single card, so the card has to say
  // so — otherwise the quantity looks wrong against any one shelf.
  const multiLocation = part.locations.length > 1;

  // eBay's canonical item URL. Built from the id the part already stores rather than
  // synced, since it never changes for a given listing.
  const listingUrl = part.records.find((r) => r.ebayListingId)?.ebayListingId
    ? `https://www.ebay.com/itm/${part.records.find((r) => r.ebayListingId)!.ebayListingId}`
    : null;
  const showEbayRow = sold.soldQty > 0 || part.itemListed;
  const onEbay = part.itemListed || sold.soldQty > 0;
  // Earliest listing date across the SKU's rows, matching how the rest of the app dates a
  // listing — a relist on one row shouldn't reset the clock.
  const listedDays = daysListed(
    part.records
      .map((r) => r.itemListedDate)
      .filter((d): d is string => !!d)
      .sort()[0]
  );

  return (
    <div className="shrink-0 overflow-hidden rounded-[10px] border border-border bg-surface transition-shadow hover:shadow-md">
    <button
      onClick={() => set({ selectedId: part.id, modalOpen: true })}
      className="w-full p-3 text-left"
    >
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 text-sm font-semibold text-textPri">{part.sku}</span>
        {onEbay && (
          <span className="shrink-0 text-right">
            <span className="block text-sm font-bold leading-tight tabular-nums text-textPri">
              {sold.soldQty > 0 ? money(sold.totals.gross) : askingPrice > 0 ? money(askingPrice) : '—'}
            </span>
            <span className="block text-[9px] font-semibold uppercase tracking-wide text-textMuted">
              {sold.soldOut ? 'Sold' : sold.soldQty > 0 ? 'Part sold' : 'Listed'}
            </span>
          </span>
        )}
        {isHighPriority(part.fieldReviewPriority) && (
          <span
            title={part.fieldReviewPriority}
            aria-label={`High priority: ${part.fieldReviewPriority}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surfaceMuted text-orange-500"
          >
            <AlertTriangle size={12} />
          </span>
        )}
        {sold.soldOut && (
          <span
            title={`All ${sold.soldQty} sold`}
            aria-label={`Sold out — all ${sold.soldQty} sold`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
          >
            <ShoppingCart size={12} />
          </span>
        )}
        {part.needsReview && (
          <span
            title={part.needsReviewNote || 'Flagged for review'}
            aria-label={`Needs review${part.needsReviewNote ? `: ${part.needsReviewNote}` : ''}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-700"
          >
            <Flag size={12} />
          </span>
        )}
        {/* Copilot has written this part up: whoever lists it can go straight to eBay. */}
        {isResearched(researched, part.sku) && !part.itemListed && (
          <span
            title="Copilot research is ready"
            aria-label="Copilot research is ready"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700"
          >
            <Sparkles size={12} />
          </span>
        )}
        {isPositiveMargin(part.grossMarginStatus) && (
          <span
            title="Positive gross margin"
            aria-label="Positive gross margin"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <DollarSign size={12} />
          </span>
        )}
      </div>
      <div className="mb-2 line-clamp-2 min-h-[2rem] text-xs leading-snug text-textMuted">{part.description}</div>
      {/* Where it is kept and how many, which the figures below don't say. */}
      {onEbay && (
        <div className="mb-2.5 truncate text-[11px] text-textMuted">
          {part.inventorySite || '—'}
          <span className="mx-1.5 text-border">·</span>
          <span className="font-medium text-textPri">Qty {listing ? listing.quantityAvailable : part.qoh}</span>
        </div>
      )}
      {/* Same two-column grid as ProcessingStatusChips below, so the two blocks line up
          instead of one being a ragged wrap and the other a tidy grid. */}
      <div className="grid grid-cols-2 gap-1.5">
        {onEbay ? (
          /* Once something is on eBay, how it is performing is the useful thing to see at
             a glance. Manufacturer, site, bin and quantity are a click away in Part
             Detail, and remain sortable and filterable from the toolbar. */
          /* Four figures rather than four chips: on eBay these are all counts of the same
             kind, and read across as a row the way a listing's own stats do. */
          <div className="col-span-2 grid grid-cols-4 gap-1 border-t border-border pt-2.5">
            <Stat value={listedDays != null ? String(listedDays) : '—'} label="Days live" title="Days since it was listed on eBay" />
            <Stat
              value={listing?.impressions != null ? listing.impressions.toLocaleString() : '—'}
              label="Impr."
              title="Times shown in search or the store, last 30 days"
            />
            <Stat value={listing?.views != null ? String(listing.views) : '—'} label="Views" title="Views in the last 30 days" />
            <Stat
              value={listing ? String(listing.watchers) : '—'}
              label="Watch"
              title="People watching this listing"
              muted={!listing?.watchers}
            />
          </div>
        ) : (
          <>

          <Pill tone="chip" className="w-full">
            <Wrench size={12} className="shrink-0" />
            <span className="truncate">{part.manufacturer || '—'}</span>
          </Pill>
          {multiLocation ? (
            <Pill tone="chip" className="w-full">
              <Layers size={12} className="shrink-0" />
              <span
                className="truncate"
                title={part.locations.map((l) => `${l.inventorySite} ${l.binLocation} (${l.qoh})`).join(' · ')}
              >
                {part.locations.length} locations
              </span>
            </Pill>
          ) : (
            <Pill tone="chip" className="w-full">
              <Factory size={12} className="shrink-0" />
              <span className="truncate">{part.inventorySite || '—'}</span>
            </Pill>
          )}
          <Pill tone="chip" className="w-full">
            <MapPin size={12} className="shrink-0" />
            <span className="truncate" title={part.locations.map((l) => l.binLocation || '—').join(' · ')}>
              {multiLocation
                ? part.locations.map((l) => l.binLocation || '—').join(', ')
                : part.binLocation || '—'}
            </span>
          </Pill>
          <Pill tone="chip" className="w-full">
            <Package size={12} className="shrink-0" />
            <span className="truncate" title={multiLocation ? 'Total across all locations' : undefined}>
              QOH: {part.qoh}
            </span>
          </Pill>
          {/* Only shown once the part has actually been moved, so an un-moved part's card
              looks exactly as it did before. */}
          {part.newBinLocation && (
            <Pill
              tone="chip"
              className="w-full border-primary/20 bg-primary/10 font-semibold text-primary"
            >
              <ArrowRight size={12} className="shrink-0" />
              <span className="truncate" title={`Moved to recovery bin ${part.newBinLocation}`}>
                {part.newBinLocation}
              </span>
            </Pill>
          )}
          </>
        )}
        {/* A counted-but-mismatched quantity is the one thing on a card that needs chasing,
            so it gets a hard colour rather than the neutral chip treatment. */}
        {discrepancy && discrepancy.kind !== 'none' && !onEbay && (
          <Pill
            className={cn(
              'w-full font-semibold',
              discrepancy.variance < 0
                ? 'border-red-200 bg-red-100 text-red-700'
                : 'border-amber-200 bg-amber-100 text-amber-700'
            )}
          >
            <AlertTriangle size={12} className="shrink-0" />
            <span
              className="truncate"
              title={`Counted ${part.confirmedQoh}, system says ${part.expectedForCounted}`}
            >
              {discrepancy.kind === 'notFound'
                ? `Not Found (${formatVariance(discrepancy.variance)})`
                : formatVariance(discrepancy.variance)}
            </span>
          </Pill>
        )}
      </div>
      {part.workflowStatus === 'Processing' && (
        <div className="mt-3">
          <ProcessingStatusChips part={part} />
        </div>
      )}
    </button>

    {/* eBay status gets its own row rather than a chip. It is a different kind of fact
        from a bin or a quantity, and as a pill it ran the full width of the card and
        broke the two-column rhythm of everything above it. */}
    {showEbayRow && (
      <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs">
        <span
          aria-hidden="true"
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            sold.soldOut ? 'bg-emerald-600' : sold.soldQty > 0 ? 'bg-amber-500' : 'bg-primary'
          )}
        />
        <span className="truncate font-medium text-textPri">
          {/* The money sits on the right already, so the label only has to say the state. */}
          {sold.soldOut
            ? 'Sold out'
            : sold.soldQty > 0
              ? `${sold.soldQty} sold · ${sold.remainingQty} left`
              : 'Active on eBay'}
        </span>
        {listingUrl && (
          <a
            href={listingUrl}
            target="_blank"
            rel="noreferrer"
            // The card behind this opens the detail modal; the link must not do both.
            onClick={(e) => e.stopPropagation()}
            className="ml-auto shrink-0 rounded-btn border border-border px-2 py-0.5 font-medium text-primary hover:bg-surfaceMuted"
            title="Open this listing on eBay"
          >
            View <ExternalLink size={10} className="inline align-[-1px]" />
          </a>
        )}
      </div>
    )}
    </div>
  );
}
