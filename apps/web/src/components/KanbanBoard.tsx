import { useMemo, useState } from 'react';
import { groupPartsBySku, indexListings, indexSales, type PartGroup, type WorkflowStatus } from '@warehouse/shared';
import { useInventoryParts } from '../hooks/useInventoryParts';
import { useResearchedSkus } from '../hooks/useResearchedSkus';
import { useListings } from '../hooks/useListings';
import { useSales } from '../hooks/useSales';
import { filterBoard, visibleStatuses } from '../lib/boardView';
import { useUIStore } from '../state/useUIStore';
import { BucketColumn } from './BucketColumn';


// Tailwind needs static class names, so a computed `lg:grid-cols-${n}` string won't
// generate — this maps the visible column count to a real class.
const GRID_COLS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
};

/** Cards were drawn for a third of the board; a lone column shouldn't stretch to fill it. */
const COLUMN_WIDTH: Record<number, string> = {
  1: 'lg:max-w-md',
  2: 'lg:max-w-3xl',
  3: 'lg:max-w-none',
};

export function KanbanBoard() {
  const { data, isLoading } = useInventoryParts();
  /**
   * Which column is being worked in, below lg where the three stack. Nothing is open to
   * begin with: the choice of pile is the first decision, and three collapsed headers make
   * that choice in one screen rather than burying it under a hundred cards.
   */
  const [focused, setFocused] = useState<WorkflowStatus | null>(null);
  const { data: sales } = useSales();
  const { data: listings } = useListings();
  const {
    search,
    sites,
    bins,
    recoveryBins,
    manufacturers,
    statuses,
    completedTasks,
    research,
    sales: saleFilters,
    progress,
    ages,
    margins,
    discrepancies,
    needsReview,
    sort,
    sortThen,
  } = useUIStore();

  // Every row for a SKU is folded into one card. The sheet keeps its separate rows —
  // this is purely how the board reads them.
  const researched = useResearchedSkus();
  const groups = useMemo(() => groupPartsBySku(data ?? []), [data]);
  const salesIndex = useMemo(() => indexSales(sales ?? []), [sales]);
  const listingsIndex = useMemo(() => indexListings(listings ?? []), [listings]);

  const filtered = useMemo(
    () =>
      filterBoard(
        { groups, researched, salesIndex, listingsIndex },
        {
          search,
          sites,
          bins,
          recoveryBins,
          manufacturers,
          statuses,
          completedTasks,
          research,
          sales: saleFilters,
          progress,
          ages,
          margins,
          discrepancies,
          needsReview,
          sort,
          sortThen,
          // The column applies its own All / Listed / Sold choice.
          ebayView: 'all',
        }
      ),
    [
      groups,
      search,
      sites,
      bins,
      recoveryBins,
      manufacturers,
      statuses,
      completedTasks,
      research,
      researched,
      saleFilters,
      salesIndex,
      progress,
      ages,
      margins,
      discrepancies,
      needsReview,
      sort,
      sortThen,
      listingsIndex,
    ]
  );

  if (isLoading) {
    return <div className="py-16 text-center text-textMuted">Loading inventory…</div>;
  }

  const buckets: Record<WorkflowStatus, PartGroup[]> = {
    NotStarted: filtered.filter((p) => p.workflowStatus === 'NotStarted'),
    Processing: filtered.filter((p) => p.workflowStatus === 'Processing'),
    Listed: filtered.filter((p) => p.workflowStatus === 'Listed'),
  };
  // The same counts before filtering, so a column can say "12 of 330" rather than leaving
  // someone to wonder whether the pile really is that small.
  const totals: Record<WorkflowStatus, number> = {
    NotStarted: groups.filter((p) => p.workflowStatus === 'NotStarted').length,
    Processing: groups.filter((p) => p.workflowStatus === 'Processing').length,
    Listed: groups.filter((p) => p.workflowStatus === 'Listed').length,
  };

  const shownStatuses = visibleStatuses({ statuses });

  return (
    // One or two columns keep a readable width and sit in the middle, rather than a single
    // column stretched across a desk monitor.
    <div className={`mx-auto grid w-full grid-cols-1 gap-4 lg:h-full ${GRID_COLS[shownStatuses.length]} ${COLUMN_WIDTH[shownStatuses.length]}`}>
      {shownStatuses.map((status) => (
        <BucketColumn
          key={status}
          status={status}
          parts={buckets[status]}
          total={totals[status]}
          expanded={focused === status}
          onToggleExpanded={() => setFocused((f) => (f === status ? null : status))}
          // Below lg the three stack, and the one being worked in rises to the top so the
          // other two sit out of the way at the bottom rather than above the cards.
          className={focused === status ? 'order-first lg:order-none' : undefined}
          salesIndex={salesIndex}
          listingsIndex={listingsIndex}
        />
      ))}
    </div>
  );
}
