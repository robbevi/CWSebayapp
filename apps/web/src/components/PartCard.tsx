import {
  AlertTriangle,
  ArrowRight,
  DollarSign,
  ExternalLink,
  Factory,
  Flag,
  Layers,
  MapPin,
  Boxes,
  Eye,
  Package,
  ShoppingCart,
  Signal,
  Star,
  Wrench,
} from 'lucide-react';
import {
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
import { useUIStore } from '../state/useUIStore';
import { Pill } from './ui/Pill';
import { ProcessingStatusChips } from './ProcessingStatusChips';

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
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

  return (
    <div className="shrink-0 overflow-hidden rounded-[10px] border border-border bg-surface transition-shadow hover:shadow-md">
    <button
      onClick={() => set({ selectedId: part.id, modalOpen: true })}
      className="w-full p-3 text-left"
    >
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 text-sm font-semibold text-textPri">{part.sku}</span>
        {isHighPriority(part.fieldReviewPriority) && (
          <span
            title={part.fieldReviewPriority}
            aria-label={`High priority: ${part.fieldReviewPriority}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"
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
      {/* Same two-column grid as ProcessingStatusChips below, so the two blocks line up
          instead of one being a ragged wrap and the other a tidy grid. */}
      <div className="grid grid-cols-2 gap-1.5">
        {onEbay ? (
          /* Once something is on eBay, how it is performing is the useful thing to see at
             a glance. Manufacturer, site, bin and quantity are a click away in Part
             Detail, and remain sortable and filterable from the toolbar. */
          <>
            <Pill tone="chip" className="w-full">
              <Star size={12} className="shrink-0" />
              <span className="truncate" title="People watching this listing">
                {listing ? `${listing.watchers} watching` : 'Watchers —'}
              </span>
            </Pill>
            <Pill tone="chip" className="w-full">
              <Eye size={12} className="shrink-0" />
              <span className="truncate" title="Views in the last 30 days">
                {listing?.views != null ? `${listing.views} views` : 'Views —'}
              </span>
            </Pill>
            <Pill tone="chip" className="w-full">
              <Signal size={12} className="shrink-0" />
              <span className="truncate" title="Times shown in search or the store, last 30 days">
                {listing?.impressions != null ? `${listing.impressions.toLocaleString()} impr` : 'Impr —'}
              </span>
            </Pill>
            <Pill tone="chip" className="w-full">
              <Boxes size={12} className="shrink-0" />
              <span className="truncate" title="Quantity available on the listing">
                {listing ? `Qty ${listing.quantityAvailable}` : `Qty ${part.qoh}`}
              </span>
            </Pill>
          </>
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
        {discrepancy && discrepancy.kind !== 'none' && (
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
        <span className="ml-auto shrink-0 font-semibold tabular-nums text-textPri">
          {sold.soldQty > 0 ? money(sold.totals.gross) : askingPrice > 0 ? money(askingPrice) : '—'}
        </span>
        {listingUrl && (
          <a
            href={listingUrl}
            target="_blank"
            rel="noreferrer"
            // The card behind this opens the detail modal; the link must not do both.
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 font-medium text-primary hover:underline"
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
