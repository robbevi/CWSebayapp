import type { InventoryPart } from './types.js';

export type UserRole = 'warehouse' | 'lister';

export interface AppUser {
  name: string;
  role: UserRole;
}

// The actual roster (real names) lives server-side only, in the APP_USERS_JSON env
// var — this is a public repo, so real employee names never get committed to source.
export function roleForUser(roster: AppUser[], name: string): UserRole | undefined {
  return roster.find((u) => u.name === name)?.role;
}

export const GOALS = { day: 5, week: 30, month: 100 };

// Warehouse staff only handle photos and condition logging — Cetaris transfer is
// optional for them, and eBay listing is the lister's job — so their "win" is just
// these three fields all being set, regardless of who eventually transfers/lists it.
export function isWarehouseWin(p: Pick<InventoryPart, 'photographed' | 'itemCondition' | 'boxCondition'>): boolean {
  return p.photographed === true && !!p.itemCondition && !!p.boxCondition;
}

// Listers' job is getting the part onto eBay.
export function isListerWin(p: Pick<InventoryPart, 'itemListed'>): boolean {
  return p.itemListed === true;
}

export function isWinForRole(
  role: UserRole,
  p: Pick<InventoryPart, 'photographed' | 'itemCondition' | 'boxCondition' | 'itemListed'>
): boolean {
  return role === 'warehouse' ? isWarehouseWin(p) : isListerWin(p);
}

export interface Submission {
  sku: string;
  user: string;
  role: UserRole;
  completedAt: string;
}

export interface SubmissionSummary {
  user: string;
  role: UserRole;
  day: number;
  week: number;
  month: number;
}
