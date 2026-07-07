import { create } from 'zustand';

export type SortKey = 'Bin' | 'SKU' | 'Manufacturer' | 'Site';

interface UIState {
  search: string;
  site: string;
  bin: string;
  mfr: string;
  sort: SortKey;
  selectedId: string | null;
  modalOpen: boolean;
  set: (patch: Partial<UIState>) => void;
}

export const useUIStore = create<UIState>((set) => ({
  search: '',
  site: 'All',
  bin: 'All',
  mfr: 'All',
  sort: 'Bin',
  selectedId: null,
  modalOpen: false,
  set: (patch) => set(patch),
}));
