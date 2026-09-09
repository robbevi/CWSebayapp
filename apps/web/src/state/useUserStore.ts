import { create } from 'zustand';

const STORAGE_KEY = 'currentUser';

interface UserState {
  currentUser: string | null;
  /**
   * Whether the picker is open for a deliberate change of user, as opposed to the first
   * sign-in. Kept separate from `currentUser` so backing out of a change leaves the
   * original user signed in — clearing the name to reopen the picker would sign them out
   * of a shared warehouse tablet on a mis-tap.
   */
  switching: boolean;
  setUser: (name: string) => void;
  startSwitch: () => void;
  cancelSwitch: () => void;
}

export const useUserStore = create<UserState>((set) => ({
  currentUser: localStorage.getItem(STORAGE_KEY),
  switching: false,
  setUser: (name) => {
    localStorage.setItem(STORAGE_KEY, name);
    set({ currentUser: name, switching: false });
  },
  startSwitch: () => set({ switching: true }),
  cancelSwitch: () => set({ switching: false }),
}));
