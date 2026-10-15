import { create } from 'zustand';
import type { AgeBandKey, TaskKey, WorkflowStatus } from '@warehouse/shared';

export type SortKey =
  | 'SKU'
  | 'Bin Location'
  | 'Recovery Bin'
  | 'Manufacturer'
  | 'Inventory Site'
  | 'Quantity On Hand'
  | 'Progress'
  | 'Revenue Priority'
  | 'Recovery Price'
  | 'Gross Margin'
  | 'Field Review Priority'
  | 'Watchers'
  | 'Views'
  | 'Impressions'
  | 'Qty Listed';

export type MarginFilter = 'Positive Gross Margin' | 'Negative Gross Margin';

export type DiscrepancyFilter = 'shortage' | 'overage' | 'notFound';

/**
 * Where a part stands with Copilot: written up, waiting its turn, or not far enough along
 * the warehouse work to be worth researching. Empty means don't care.
 */
export type ResearchFilter = 'researched' | 'ready' | 'notReady';

/** Whether anything has sold. Sold parts stay on the board, in the Listed / Sold column. */
export type SaleFilter = 'sold' | 'unsold' | 'awaitingCetaris' | 'cetarisPending' | 'complete';

/** How the Listed / Sold column is read: everything, what is still for sale, or what has sold. */
export type EbayView = 'all' | 'listed' | 'sold';

/** The district SPARE sells from; every other district's stock is on its way here. */
export const WILLISTON = 'Williston';

interface UIState {
  search: string;
  sites: string[];
  bins: string[];
  recoveryBins: string[];
  manufacturers: string[];
  statuses: WorkflowStatus[];
  completedTasks: TaskKey[];
  margins: MarginFilter[];
  discrepancies: DiscrepancyFilter[];
  research: ResearchFilter[];
  sales: SaleFilter[];
  /** Parts with exactly this many of the five checkpoints done. */
  progress: number[];
  /** How long since anyone touched the part. */
  ages: AgeBandKey[];
  needsReview: boolean;
  sort: SortKey;
  /** Breaks ties in the first sort — bin within a site, priority within a bin. */
  sortThen: SortKey | null;
  /**
   * The Listed / Sold column's own All / Listed / Sold choice. A way of reading one column
   * rather than a filter, so clearing the filters leaves it be; kept here so the export
   * sees it too.
   */
  ebayView: EbayView;
  /**
   * Whose stock the dashboard shows: Williston's own, or a district's on its way in. Not a
   * filter, so clearing the filters leaves it be.
   */
  district: string;
  /** The Inbound screen: packing, shipping and receiving crates. */
  inboundOpen: boolean;
  /** Which part of the Inbound screen to open on, when something asked for one. */
  inboundStart: 'pack' | null;
  selectedId: string | null;
  modalOpen: boolean;
  set: (patch: Partial<UIState>) => void;
  clearAll: () => void;
}

const DEFAULTS = {
  search: '',
  sites: [] as string[],
  bins: [] as string[],
  recoveryBins: [] as string[],
  manufacturers: [] as string[],
  statuses: [] as WorkflowStatus[],
  completedTasks: [] as TaskKey[],
  margins: [] as MarginFilter[],
  discrepancies: [] as DiscrepancyFilter[],
  research: [] as ResearchFilter[],
  sales: [] as SaleFilter[],
  progress: [] as number[],
  ages: [] as AgeBandKey[],
  needsReview: false,
  sort: 'Bin Location' as SortKey,
  sortThen: null as SortKey | null,
};

export const useUIStore = create<UIState>((set) => ({
  ...DEFAULTS,
  ebayView: 'all',
  district: WILLISTON,
  inboundOpen: false,
  inboundStart: null,
  selectedId: null,
  modalOpen: false,
  set: (patch) => set(patch),
  clearAll: () => set(DEFAULTS),
}));
