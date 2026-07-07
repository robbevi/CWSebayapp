import { getGraphClient } from './client.js';
import { env } from '../config/env.js';

export interface ResolvedContext {
  siteId: string;
  listId: string;
  driveId: string;
  columnMap: Record<string, string>;
  photosFolderPath: string;
}

let cached: ResolvedContext | null = null;
let inFlight: Promise<ResolvedContext> | null = null;

async function resolve(): Promise<ResolvedContext> {
  const client = getGraphClient();

  const site = await client.api(`/sites/${env.siteHostname}:${env.sitePath}`).get();
  const siteId = site.id as string;

  const escapedListName = env.listName!.replace(/'/g, "''");
  const listsRes = await client
    .api(`/sites/${siteId}/lists`)
    .filter(`displayName eq '${escapedListName}'`)
    .get();
  const list = listsRes.value?.[0];
  if (!list) {
    throw new Error(`SharePoint list "${env.listName}" was not found on site ${env.sitePath}.`);
  }
  const listId = list.id as string;

  const columnsRes = await client.api(`/sites/${siteId}/lists/${listId}/columns`).get();
  const columnMap: Record<string, string> = {};
  for (const col of columnsRes.value ?? []) {
    if (col.displayName && col.name) columnMap[col.displayName] = col.name;
  }

  const drive = await client.api(`/sites/${siteId}/drive`).get();
  const driveId = drive.id as string;

  return { siteId, listId, driveId, columnMap, photosFolderPath: env.photosFolderPath! };
}

export async function getResolvedContext(): Promise<ResolvedContext> {
  if (cached) return cached;
  if (!inFlight) {
    inFlight = resolve()
      .then((r) => {
        cached = r;
        return r;
      })
      .catch((err) => {
        inFlight = null;
        throw err;
      });
  }
  return inFlight;
}

export function clearResolvedContextCache(): void {
  cached = null;
  inFlight = null;
}

export function internalName(columnMap: Record<string, string>, displayName: string): string {
  const internal = columnMap[displayName];
  if (!internal) {
    throw new Error(`SharePoint column "${displayName}" was not found on the list. Check the list schema.`);
  }
  return internal;
}
