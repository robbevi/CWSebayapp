import { create } from 'zustand';
import type { Session } from '../lib/api';

interface UserState {
  /**
   * The signed-in person's name. Kept alongside `session` because much of the app only
   * needs the name, and read it from here before sign-in existed.
   */
  currentUser: string | null;
  session: Session | null;
  /** The server has answered whether anyone is signed in. */
  checked: boolean;
  setSession: (session: Session | null) => void;
}

// Who is signed in comes only from the server's session cookie. Nothing is remembered in
// the browser: a name kept there could be edited to take credit as someone else.
export const useUserStore = create<UserState>((set) => ({
  currentUser: null,
  session: null,
  checked: false,
  setSession: (session) => set({ session, currentUser: session?.name ?? null, checked: true }),
}));
