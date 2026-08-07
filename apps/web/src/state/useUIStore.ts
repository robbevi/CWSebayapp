import { create } from 'zustand';
import type { TaskKey, WorkflowStatus } from '@warehouse/shared';

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
  | 'Qty Discrepancy';

export type MarginFilter = 'Positive Gross Margin' | 'Negative Gross Margin';

export type DiscrepancyFilter = 'shortage' | 'overage' | 'notFound';

interface UIState {
  search: string;
  sites: string[];
  bins: string[];
  recoveryBins: string[];
  manufacturers: string[];
  statuses: WorkflowStatus[];
  missingTasks: TaskKey[];
  margins: MarginFilter[];
  discrepancies: DiscrepancyFilter[];
  sort: SortKey;
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
  missingTasks: [] as TaskKey[],
  margins: [] as MarginFilter[],
  discrepancies: [] as DiscrepancyFilter[],
  sort: 'Bin Location' as SortKey,
};

export const useUIStore = create<UIState>((set) => ({
  ...DEFAULTS,
  selectedId: null,
  modalOpen: false,
  set: (patch) => set(patch),
  clearAll: () => set(DEFAULTS),
}));
