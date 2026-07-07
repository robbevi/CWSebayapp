import { create } from 'zustand';

interface ToastState {
  message: string | null;
  variant: 'success' | 'error';
  show: (message: string, variant?: 'success' | 'error') => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  variant: 'success',
  show: (message, variant = 'success') => set({ message, variant }),
  clear: () => set({ message: null }),
}));
