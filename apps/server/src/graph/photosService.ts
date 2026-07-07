import type { Photo } from '@warehouse/shared';
import { extractSkuFromFileName, buildPhotoFileName } from '../lib/photoNaming.js';
import { getGraphClient } from './client.js';
import { getResolvedContext } from './siteResolver.js';

function encodeFolderPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
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
