import { deriveStatus } from '@warehouse/shared';
import type { InventoryPart, InventoryPartPatch, Photo } from '@warehouse/shared';
import { getGraphClient } from './client.js';
import { DISPLAY, type FieldKey } from './fieldMap.js';
import { getResolvedContext, internalName } from './siteResolver.js';
import { listPhotosGroupedBySku } from './photosService.js';

function fieldValue(fields: Record<string, unknown>, columnMap: Record<string, string>, key: FieldKey): unknown {
  return fields[internalName(columnMap, DISPLAY[key])];
}

function mapItemToPart(
  item: { id: string; lastModifiedDateTime?: string; fields?: Record<string, unknown> },
  columnMap: Record<string, string>,
  photosBySku: Map<string, Photo[]>
): InventoryPart {
  const fields = item.fields ?? {};
  const get = (key: FieldKey) => fieldValue(fields, columnMap, key);

  const sku = String(get('sku') ?? '');
  const photos = photosBySku.get(sku.toUpperCase()) ?? [];
  const confirmedQohRaw = get('confirmedQoh');

  const base = {
    id: item.id,
    sku,
    description: String(get('description') ?? ''),
    manufacturer: String(get('manufacturer') ?? ''),
    inventorySite: String(get('inventorySite') ?? ''),
    binLocation: String(get('binLocation') ?? ''),
    qoh: Number(get('qoh') ?? 0),
    confirmedQoh: confirmedQohRaw === undefined || confirmedQohRaw === null || confirmedQohRaw === ''
      ? null
      : Number(confirmedQohRaw),
    notes: (get('notes') as string) ?? undefined,
    itemCondition: (get('itemCondition') as string) ?? undefined,
    boxCondition: (get('boxCondition') as string) ?? undefined,
    photographed: Boolean(get('photographed')) || photos.length > 0,
    itemListed: Boolean(get('itemListed')),
    itemListedDate: (get('itemListedDate') as string) ?? null,
    ebayListingId: (get('ebayListingId') as string) ?? null,
    transferredToMarketRecovery: Boolean(get('transferredToMarketRecovery')),
    transferId: (get('transferId') as string) ?? null,
    catalogingStartDate: (get('catalogingStartDate') as string) ?? null,
    legacyPartId: (get('legacyPartId') as string) ?? undefined,
    importSequenceNumber: get('importSequenceNumber') != null ? Number(get('importSequenceNumber')) : null,
    photos,
    updatedAt: item.lastModifiedDateTime,
  };

  return { ...base, workflowStatus: deriveStatus(base) };
}

export async function getAllParts(): Promise<InventoryPart[]> {
  const client = getGraphClient();
  const { siteId, listId, columnMap } = await getResolvedContext();
  const photosBySku = await listPhotosGroupedBySku();

  const parts: InventoryPart[] = [];
  let url: string | undefined = `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=200`;

  while (url) {
    const res: any = await client.api(url).get();
    for (const item of res.value ?? []) {
      parts.push(mapItemToPart(item, columnMap, photosBySku));
    }
    url = res['@odata.nextLink'];
  }
  return parts;
}

export async function getPartById(itemId: string): Promise<InventoryPart> {
  const client = getGraphClient();
  const { siteId, listId, columnMap } = await getResolvedContext();
  const photosBySku = await listPhotosGroupedBySku();

  const item = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}`).expand('fields').get();
  return mapItemToPart(item, columnMap, photosBySku);
}

export async function updatePart(itemId: string, patch: InventoryPartPatch): Promise<InventoryPart> {
  const client = getGraphClient();
  const { siteId, listId, columnMap } = await getResolvedContext();

  const fieldsPayload: Record<string, unknown> = {};
  const setIfPresent = (key: FieldKey, value: unknown) => {
    if (value !== undefined) fieldsPayload[internalName(columnMap, DISPLAY[key])] = value;
  };

  setIfPresent('confirmedQoh', patch.confirmedQoh);
  setIfPresent('notes', patch.notes);
  setIfPresent('itemCondition', patch.itemCondition);
  setIfPresent('boxCondition', patch.boxCondition);
  setIfPresent('photographed', patch.photographed);
  setIfPresent('itemListed', patch.itemListed);
  setIfPresent('itemListedDate', patch.itemListedDate);
  setIfPresent('ebayListingId', patch.ebayListingId);
  setIfPresent('transferredToMarketRecovery', patch.transferredToMarketRecovery);
  setIfPresent('transferId', patch.transferId);
  setIfPresent('catalogingStartDate', patch.catalogingStartDate);

  if (Object.keys(fieldsPayload).length > 0) {
    await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`).update(fieldsPayload);
  }

  return getPartById(itemId);
}

export async function markPhotographed(itemId: string): Promise<void> {
  const client = getGraphClient();
  const { siteId, listId, columnMap } = await getResolvedContext();
  await client
    .api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`)
    .update({ [internalName(columnMap, DISPLAY.photographed)]: true });
}

export interface CreatePartFields {
  sku: string;
  description?: string;
  manufacturer?: string;
  inventorySite?: string;
  binLocation?: string;
  qoh?: number;
  confirmedQoh?: number | null;
  itemCondition?: string;
  boxCondition?: string;
  notes?: string;
  photographed?: boolean;
  itemListed?: boolean;
  itemListedDate?: string | null;
  ebayListingId?: string | null;
  transferredToMarketRecovery?: boolean;
  transferId?: string | null;
  catalogingStartDate?: string | null;
  legacyPartId?: string;
  importSequenceNumber?: number | null;
}

export async function createPart(data: CreatePartFields): Promise<string> {
  const client = getGraphClient();
  const { siteId, listId, columnMap } = await getResolvedContext();

  const fieldsPayload: Record<string, unknown> = {};
  const set = (key: FieldKey, value: unknown) => {
    if (value !== undefined && value !== null) fieldsPayload[internalName(columnMap, DISPLAY[key])] = value;
  };

  set('sku', data.sku);
  set('description', data.description);
  set('manufacturer', data.manufacturer);
  set('inventorySite', data.inventorySite);
  set('binLocation', data.binLocation);
  set('qoh', data.qoh);
  set('confirmedQoh', data.confirmedQoh);
  set('itemCondition', data.itemCondition);
  set('boxCondition', data.boxCondition);
  set('notes', data.notes);
  set('photographed', data.photographed ?? false);
  set('itemListed', data.itemListed ?? false);
  set('itemListedDate', data.itemListedDate);
  set('ebayListingId', data.ebayListingId);
  set('transferredToMarketRecovery', data.transferredToMarketRecovery ?? false);
  set('transferId', data.transferId);
  set('catalogingStartDate', data.catalogingStartDate);
  set('legacyPartId', data.legacyPartId);
  set('importSequenceNumber', data.importSequenceNumber);

  const created = await client.api(`/sites/${siteId}/lists/${listId}/items`).post({ fields: fieldsPayload });
  return created.id as string;
}

export async function updatePartFields(itemId: string, data: Partial<CreatePartFields>): Promise<void> {
  const client = getGraphClient();
  const { siteId, listId, columnMap } = await getResolvedContext();

  const fieldsPayload: Record<string, unknown> = {};
  const set = (key: FieldKey, value: unknown) => {
    if (value !== undefined) fieldsPayload[internalName(columnMap, DISPLAY[key])] = value;
  };

  set('description', data.description);
  set('manufacturer', data.manufacturer);
  set('inventorySite', data.inventorySite);
  set('binLocation', data.binLocation);
  set('qoh', data.qoh);
  set('confirmedQoh', data.confirmedQoh);
  set('itemCondition', data.itemCondition);
  set('boxCondition', data.boxCondition);
  set('notes', data.notes);
  set('itemListed', data.itemListed);
  set('itemListedDate', data.itemListedDate);
  set('ebayListingId', data.ebayListingId);
  set('transferredToMarketRecovery', data.transferredToMarketRecovery);
  set('transferId', data.transferId);
  set('catalogingStartDate', data.catalogingStartDate);
  set('importSequenceNumber', data.importSequenceNumber);

  if (Object.keys(fieldsPayload).length > 0) {
    await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`).update(fieldsPayload);
  }
}
