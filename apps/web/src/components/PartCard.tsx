import {
  AlertTriangle,
  ArrowRight,
  DollarSign,
  Factory,
  Flag,
  Layers,
  MapPin,
  Package,
  ShoppingCart,
  Tag,
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

  return (
    <button
      onClick={() => set({ selectedId: part.id, modalOpen: true })}
      className="shrink-0 rounded-[10px] border border-border bg-surface p-3 text-left transition-shadow hover:shadow-md"
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
        {/* Sold progress rather than a plain "sold" flag: most listings carry several
            units, so what matters on the card is how many are still on the shelf. */}
        {sold.soldQty > 0 ? (
          <Pill
            className={cn(
              'w-full font-semibold',
              sold.soldOut
                ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            )}
          >
            <ShoppingCart size={12} className="shrink-0" />
            <span
              className="truncate"
              title={`${sold.soldQty} sold for ${money(sold.totals.gross)} gross, ${sold.remainingQty} remaining`}
            >
              Sold &times;{sold.soldQty} · {money(sold.totals.gross)}
            </span>
          </Pill>
        ) : (
          // Nothing sold yet, but it's up for sale — show what it's asking for. Not gated
          // on the part being finished: most listings are still mid-workflow.
          part.itemListed && (
            /* Full width: "Listed on eBay - $1,260.00" does not fit a half-width pill. */
            <Pill className="col-span-2 w-full border-sky-200 bg-sky-50 font-semibold text-sky-700">
              <Tag size={12} className="shrink-0" />
              {/* Imported rows without any price would otherwise advertise $0.00. */}
              <span
                className="truncate"
                title={askingPrice > 0 ? `Listed on eBay at ${money(askingPrice)}` : 'Listed on eBay'}
              >
                {askingPrice > 0 ? `Listed on eBay - ${money(askingPrice)}` : 'Listed on eBay'}
              </span>
            </Pill>
          )
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
  );
}
