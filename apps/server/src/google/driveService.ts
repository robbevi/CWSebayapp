import { Readable } from 'node:stream';
import type { Photo } from '@warehouse/shared';
import { env } from '../config/env.js';
import { buildPhotoFileName, extractSkuFromFileName } from '../lib/photoNaming.js';
import { getDriveClient } from './client.js';

export async function checkAccess(): Promise<void> {
  const drive = getDriveClient();
  await drive.files.get({ fileId: env.googleDriveFolderId!, fields: 'id' });
}

export async function listPhotosGroupedBySku(): Promise<Map<string, Photo[]>> {
  const drive = getDriveClient();
  const grouped = new Map<string, Photo[]>();

  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${env.googleDriveFolderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, createdTime)',
      pageSize: 200,
      pageToken,
    });

    for (const file of res.data.files ?? []) {
      if (!file.name || !file.id) continue;
      const sku = extractSkuFromFileName(file.name);
      if (!sku) continue;
      const list = grouped.get(sku) ?? [];
      list.push({
        fileName: file.name,
        url: `https://drive.google.com/uc?export=view&id=${file.id}`,
        uploadedAt: file.createdTime ?? new Date().toISOString(),
      });
      grouped.set(sku, list);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return grouped;
}

export async function uploadPhoto(sku: string, buffer: Buffer): Promise<Photo> {
  const drive = getDriveClient();
  const fileName = buildPhotoFileName(sku);

  const created = await drive.files.create({
    requestBody: { name: fileName, parents: [env.googleDriveFolderId!] },
    media: { mimeType: 'image/jpeg', body: Readable.from(buffer) },
    fields: 'id, name, createdTime',
  });

  const fileId = created.data.id;
  if (!fileId) throw new Error('Google Drive did not return a file id for the uploaded photo.');

  // Photos are shared "anyone with the link" so they can be displayed via <img src>
  // without a private-proxy route — acceptable for parts destined for a public eBay listing.
  await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });

  return {
    fileName,
    url: `https://drive.google.com/uc?export=view&id=${fileId}`,
    uploadedAt: created.data.createdTime ?? new Date().toISOString(),
  };
}
