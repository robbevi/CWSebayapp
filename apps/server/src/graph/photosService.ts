import type { Photo } from '@warehouse/shared';
import { getGraphClient } from './client.js';
import { getResolvedContext } from './siteResolver.js';

function encodeFolderPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

function extractSkuFromFileName(name: string): string | null {
  const match = name.match(/^([^_]+)_/);
  return match ? match[1].toUpperCase() : null;
}

export async function listPhotosGroupedBySku(): Promise<Map<string, Photo[]>> {
  const client = getGraphClient();
  const { driveId, photosFolderPath } = await getResolvedContext();
  const path = encodeFolderPath(photosFolderPath);

  const grouped = new Map<string, Photo[]>();
  let url: string | undefined = `/drives/${driveId}/root:/${path}:/children?$top=200&$select=name,webUrl,createdDateTime,file`;

  while (url) {
    const res: any = await client.api(url).get();
    for (const item of res.value ?? []) {
      if (!item.file) continue;
      const name = item.name as string;
      const sku = extractSkuFromFileName(name);
      if (!sku) continue;
      const list = grouped.get(sku) ?? [];
      list.push({ fileName: name, url: item.webUrl, uploadedAt: item.createdDateTime });
      grouped.set(sku, list);
    }
    url = res['@odata.nextLink'];
  }
  return grouped;
}

export function buildPhotoFileName(sku: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const safeSku = sku.replace(/[^A-Za-z0-9-]/g, '-');
  return `${safeSku}_${date}_${time}.jpg`;
}

export async function uploadPhoto(sku: string, buffer: Buffer): Promise<Photo> {
  const client = getGraphClient();
  const { driveId, photosFolderPath } = await getResolvedContext();
  const fileName = buildPhotoFileName(sku);
  const path = encodeFolderPath(`${photosFolderPath}/${fileName}`);

  const uploaded = await client.api(`/drives/${driveId}/root:/${path}:/content`).put(buffer);

  return {
    fileName,
    url: uploaded.webUrl,
    uploadedAt: uploaded.createdDateTime ?? new Date().toISOString(),
  };
}
