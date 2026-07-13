import { create } from 'zustand';
import type { TaskKey, WorkflowStatus } from '@warehouse/shared';

export type SortKey = 'SKU' | 'Bin Location' | 'Manufacturer' | 'Inventory Site' | 'Quantity On Hand' | 'Progress';

interface UIState {
  search: string;
  sites: string[];
  bins: string[];
  manufacturers: string[];
  statuses: WorkflowStatus[];
  missingTasks: TaskKey[];
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
  manufacturers: [] as string[],
  statuses: [] as WorkflowStatus[],
  missingTasks: [] as TaskKey[],
  sort: 'Bin Location' as SortKey,
};

export const useUIStore = create<UIState>((set) => ({
  ...DEFAULTS,
  selectedId: null,
  modalOpen: false,
  set: (patch) => set(patch),
  clearAll: () => set(DEFAULTS),
}));
