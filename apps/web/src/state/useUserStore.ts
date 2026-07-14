import { create } from 'zustand';

const STORAGE_KEY = 'currentUser';

interface UserState {
  currentUser: string | null;
  setUser: (name: string) => void;
}

export const useUserStore = create<UserState>((set) => ({
  currentUser: localStorage.getItem(STORAGE_KEY),
  setUser: (name) => {
    localStorage.setItem(STORAGE_KEY, name);
    set({ currentUser: name });
  },
}));
