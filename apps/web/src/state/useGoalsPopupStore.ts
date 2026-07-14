import { create } from 'zustand';

interface GoalsPopupState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useGoalsPopupStore = create<GoalsPopupState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
