import type {
  AgentListing,
  AppUser,
  CategorySuggestion,
  CreatePartInput,
  DiscrepancyLogEntry,
  HealthStatus,
  InventoryPart,
  InventoryPartPatch,
  Listing,
  ListingCheck,
  ListingRequest,
  PolicyChoice,
  PublishResult,
  ResearchResult,
  SellerPolicy,
  SellerSetup,
  TradingMessage,
  Photo,
  Sale,
  Submission,
  SubmissionSummary,
} from '@warehouse/shared';

/** Fired when the server says the session has gone, so the app can show sign-in again. */
export const SIGNED_OUT_EVENT = 'spare:signed-out';
const signalSignedOut = () => window.dispatchEvent(new Event(SIGNED_OUT_EVENT));

async function parseJson<T>(res: Response): Promise<T> {
  if (res.status === 401) signalSignedOut();
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch('/api/health');
  return parseJson(res);
}

export async function fetchParts(): Promise<InventoryPart[]> {
  const res = await fetch('/api/parts');
  return parseJson(res);
}

export async function createPart(input: CreatePartInput): Promise<InventoryPart> {
  const res = await fetch('/api/parts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function savePart(id: string, patch: InventoryPartPatch, submittedBy?: string): Promise<InventoryPart> {
  const res = await fetch(`/api/parts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...patch, submittedBy }),
  });
  return parseJson(res);
}

export async function deletePart(id: string): Promise<void> {
  const res = await fetch(`/api/parts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }
}

export async function uploadPhoto(
  sku: string,
  itemId: string,
  file: File,
  submittedBy?: string,
  site?: string
): Promise<Photo> {
  const form = new FormData();
  form.append('sku', sku);
  form.append('itemId', itemId);
  form.append('file', file);
  if (submittedBy) form.append('submittedBy', submittedBy);
  if (site) form.append('site', site);
  const res = await fetch('/api/photos', { method: 'POST', body: form });
  return parseJson(res);
}

export async function deletePhoto(fileId: string, sku: string, itemId: string): Promise<void> {
  const params = new URLSearchParams({ sku, itemId });
  const res = await fetch(`/api/photos/${encodeURIComponent(fileId)}?${params.toString()}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }
}

export async function fetchSubmissionSummary(): Promise<SubmissionSummary[]> {
  const res = await fetch('/api/submissions/summary');
  return parseJson(res);
}

export async function fetchAllSubmissions(): Promise<Submission[]> {
  const res = await fetch('/api/submissions');
  return parseJson(res);
}

export interface SalesSyncResult {
  added: number;
  updated: number;
  unchanged: number;
  fetched: number;
  estimatedFees: number;
  listings: number;
  linked: number;
  listingsError?: string;
  since: string;
}

export async function fetchSales(): Promise<Sale[]> {
  const res = await fetch('/api/sales');
  return parseJson(res);
}

export interface DraftResult {
  draftId: string;
  url: string | null;
  title: string;
  priceMissing: boolean;
}

export async function createDraft(partId: string): Promise<DraftResult> {
  const res = await fetch(`/api/parts/${encodeURIComponent(partId)}/draft`, { method: 'POST' });
  return parseJson(res);
}

export async function fetchListings(): Promise<Listing[]> {
  const res = await fetch('/api/listings');
  return parseJson(res);
}

export async function fetchSalesStatus(): Promise<{ ebayConfigured: boolean; ebayPublishing?: boolean; research?: boolean }> {
  const res = await fetch('/api/sales/status');
  return parseJson(res);
}

export async function syncSales(days?: number): Promise<SalesSyncResult> {
  const res = await fetch('/api/sales/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days }),
  });
  return parseJson(res);
}

export async function fetchDiscrepancyLog(): Promise<DiscrepancyLogEntry[]> {
  const res = await fetch('/api/discrepancies');
  return parseJson(res);
}

export async function fetchAppUsers(): Promise<AppUser[]> {
  const res = await fetch('/api/users');
  return parseJson(res);
}

export interface ImportResult {
  totalRows: number;
  created: number;
  updated: number;
  errors: { sku: string; error: string }[];
}

export async function importCsv(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/import', { method: 'POST', body: form });
  return parseJson(res);
}

/** A listing request that failed, carrying eBay's reasons when it gave any. */
export class ListingRequestError extends Error {
  messages: TradingMessage[];
  constructor(message: string, messages: TradingMessage[] = []) {
    super(message);
    this.messages = messages;
  }
}

async function listingJson<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  if (res.status === 401) signalSignedOut();
  const body = (await res.json().catch(() => ({}))) as { error?: string; messages?: TradingMessage[] };
  throw new ListingRequestError(body.error || `Request failed with status ${res.status}`, body.messages ?? []);
}

export async function fetchSellerSetup(): Promise<SellerSetup> {
  const res = await fetch('/api/ebay/seller-setup');
  return parseJson(res);
}

export async function fetchCategorySuggestions(title: string, path: string): Promise<CategorySuggestion[]> {
  const params = new URLSearchParams({ title, path });
  const res = await fetch(`/api/ebay/category-suggestions?${params.toString()}`);
  return parseJson(res);
}

export async function requestResearch(partId: string): Promise<{ requestedAt: string }> {
  const res = await fetch(`/api/parts/${encodeURIComponent(partId)}/research`, { method: 'POST' });
  return parseJson(res);
}

export async function fetchResearch(partId: string): Promise<ResearchResult> {
  const res = await fetch(`/api/parts/${encodeURIComponent(partId)}/research`);
  return parseJson(res);
}

/** The SKUs Copilot has researched, lowercased, for the board's badge and filter. */
export async function fetchResearchedSkus(): Promise<string[]> {
  const res = await fetch('/api/research/skus');
  const body = await parseJson<{ skus: string[] }>(res);
  return body.skus;
}

// The daily listing queue: SPARE proposes a batch, an admin approves, eBay holds each
// listing until its start time.

export interface PlannedListing {
  partId: string;
  sku: string;
  title: string;
  price: number | null;
  quantity: number;
  photos: number;
  condition: string;
  startAt: string;
  problems: string[];
  listing: AgentListing;
  categoryId: string;
  categoryName: string | null;
  /** SPARE guessed the category rather than matching it, so it is worth a look. */
  categoryUncertain: boolean;
  categoryAlternatives: CategorySuggestion[];
  /** Under eBay Motors, which is what decides the returns policy. */
  motors: boolean;
  shipping: 'free' | 'paid';
  policies: PolicyChoice;
}

/** The policies a reviewer can switch a listing between. */
export interface QueuePolicies {
  freeShipping: SellerPolicy | null;
  paidShipping: SellerPolicy | null;
  motorsReturns: SellerPolicy | null;
  noReturns: SellerPolicy | null;
  payment: SellerPolicy | null;
}

export interface QueuePlan {
  items: PlannedListing[];
  policyOptions: QueuePolicies;
  remaining: number;
  unresearched: number;
}

export interface QueueStatus {
  running: boolean;
  total: number;
  scheduled: number;
  failed: { sku: string; error: string }[];
  current: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  startedBy: string | null;
}

export async function fetchQueuePlan(days: number, perDay: number, hour: number): Promise<QueuePlan> {
  const res = await fetch('/api/listing-queue/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days, perDay, hour }),
  });
  return parseJson(res);
}

export async function fetchQueueStatus(): Promise<QueueStatus> {
  const res = await fetch('/api/listing-queue/status');
  return parseJson(res);
}

export async function scheduleQueue(
  items: { partId: string; startAt: string; listing: AgentListing; policies: PolicyChoice }[]
): Promise<QueueStatus> {
  const res = await fetch('/api/listing-queue/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  return parseJson(res);
}

export async function stopQueue(): Promise<QueueStatus> {
  const res = await fetch('/api/listing-queue/stop', { method: 'POST' });
  return parseJson(res);
}

/** A run of Copilot research over the parts that are ready to list but not yet researched. */
export interface ResearchBacklog {
  running: boolean;
  limit: number;
  sent: number;
  answered: number;
  failed: { sku: string; error: string }[];
  current: string | null;
  currentSince: string | null;
  /** Parts the run moved on from before Copilot answered. The reply may still arrive. */
  slow: string[];
  /** Parts still waiting for research, this run's queue included. */
  waiting: number;
  startedAt: string | null;
  finishedAt: string | null;
  startedBy: string | null;
  stoppedBy: string | null;
}

export async function fetchResearchBacklog(): Promise<ResearchBacklog> {
  const res = await fetch('/api/research/backlog');
  return parseJson(res);
}

export async function startResearchBacklog(limit: number): Promise<ResearchBacklog> {
  const res = await fetch('/api/research/backlog/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit }),
  });
  return parseJson(res);
}

export async function stopResearchBacklog(): Promise<ResearchBacklog> {
  const res = await fetch('/api/research/backlog/stop', { method: 'POST' });
  return parseJson(res);
}

export async function checkListing(partId: string, body: ListingRequest): Promise<ListingCheck> {
  const res = await fetch(`/api/parts/${encodeURIComponent(partId)}/listing/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return listingJson(res);
}

export async function publishListing(partId: string, body: ListingRequest): Promise<PublishResult> {
  const res = await fetch(`/api/parts/${encodeURIComponent(partId)}/listing/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return listingJson(res);
}

// Sign-in.

export interface Session {
  name: string;
  role: 'warehouse' | 'lister';
  admin: boolean;
}

export interface LoginUser {
  name: string;
  /** Admins sign in with a PIN; everyone else by name alone. */
  needsPin: boolean;
  hasPin: boolean;
  canSetUp: boolean;
}

export interface AdminUser {
  name: string;
  role: string;
  admin: boolean;
  hasPin: boolean;
  setAt: string | null;
  setBy: string | null;
}

async function authJson<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(body.error || `Request failed with status ${res.status}`);
}

const post = (url: string, body?: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });

/** The current session, or null when nobody is signed in. Never fires the signed-out event. */
export async function fetchMe(): Promise<Session | null> {
  const res = await fetch('/api/auth/me');
  if (res.status === 401) return null;
  return authJson(res);
}

export async function fetchLoginUsers(): Promise<LoginUser[]> {
  return authJson(await fetch('/api/auth/users'));
}

export async function login(name: string, pin?: string): Promise<Session> {
  return authJson(await post('/api/auth/login', { name, pin }));
}

export async function setUpPin(name: string, pin: string): Promise<Session> {
  return authJson(await post('/api/auth/setup', { name, pin }));
}

export async function logout(): Promise<void> {
  await post('/api/auth/logout');
}

export async function changeMyPin(currentPin: string, newPin: string): Promise<void> {
  await authJson(await post('/api/auth/pin', { currentPin, newPin }));
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  return authJson(await fetch('/api/auth/admin/users'));
}

export async function adminSetPin(name: string, pin: string): Promise<void> {
  await authJson(await post('/api/auth/admin/pin', { name, pin }));
}

