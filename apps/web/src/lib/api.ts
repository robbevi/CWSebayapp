import type {
  AppUser,
  CreatePartInput,
  HealthStatus,
  InventoryPart,
  InventoryPartPatch,
  Photo,
  Submission,
  SubmissionSummary,
} from '@warehouse/shared';

async function parseJson<T>(res: Response): Promise<T> {
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

export async function uploadPhoto(sku: string, itemId: string, file: File): Promise<Photo> {
  const form = new FormData();
  form.append('sku', sku);
  form.append('itemId', itemId);
  form.append('file', file);
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
