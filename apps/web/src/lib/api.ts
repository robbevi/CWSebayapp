import type { HealthStatus, InventoryPart, InventoryPartPatch, Photo } from '@warehouse/shared';

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

export async function savePart(id: string, patch: InventoryPartPatch): Promise<InventoryPart> {
  const res = await fetch(`/api/parts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return parseJson(res);
}

export async function uploadPhoto(sku: string, itemId: string, file: File): Promise<Photo> {
  const form = new FormData();
  form.append('sku', sku);
  form.append('itemId', itemId);
  form.append('file', file);
  const res = await fetch('/api/photos', { method: 'POST', body: form });
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
