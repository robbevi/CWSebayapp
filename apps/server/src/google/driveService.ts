import { Readable } from 'node:stream';
import type { Photo } from '@warehouse/shared';
import { env } from '../config/env.js';
import { buildPhotoFileName, extractSkuFromFileName } from '../lib/photoNaming.js';
import { getDriveClient, getDriveUploadClient } from './client.js';

// Hotlinking Google's own thumbnail/uc URLs directly is fragile in practice: the
// `uc?export=view` form gets blocked by Chrome's Opaque Response Blocking when loaded
// from an <img> tag, and the `/thumbnail` form (which avoids that) is subject to
// undocumented, fairly aggressive per-file rate limiting intended for occasional embed
// use, not sustained app traffic — it can start returning 429s after only a handful of
// loads. Proxying the bytes through our own server (see routes/photos.ts) sidesteps
// both problems and lets us set real cache headers.
function buildImageUrl(fileId: string): string {
  return `/api/photos/${fileId}/content`;
}

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
      fields: 'nextPageToken, files(id, name, createdTime, properties)',
      pageSize: 200,
      pageToken,
    });

    for (const file of res.data.files ?? []) {
      if (!file.name || !file.id) continue;
      // The real SKU is stored in Drive's custom `properties` metadata (see uploadPhoto)
      // rather than parsed back out of the filename — the filename is sanitized to
      // [A-Za-z0-9-] for display, which is lossy for SKUs containing '.', '/', '\', etc.
      // (e.g. "AB.123" and "AB/123" both sanitize to "AB-123"), so two different SKUs'
      // photos would otherwise collide or fail to match at all. Fall back to the old
      // filename-parsing for photos uploaded before this property existed.
      const sku = file.properties?.sku ?? extractSkuFromFileName(file.name);
      if (!sku) continue;
      const list = grouped.get(sku) ?? [];
      list.push({
        fileId: file.id,
        fileName: file.name,
        url: buildImageUrl(file.id),
        uploadedAt: file.createdTime ?? new Date().toISOString(),
      });
      grouped.set(sku, list);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return grouped;
}

// Streams the raw file bytes for the photo content proxy route. Uses the service
// account (read-only, already has access via the shared folder) rather than the OAuth
// upload client, since reading doesn't hit the storage-quota restriction that uploads do.
export async function getPhotoContent(fileId: string): Promise<Readable> {
  const drive = getDriveClient();
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  return res.data as unknown as Readable;
}

export async function uploadPhoto(sku: string, buffer: Buffer): Promise<Photo> {
  // Uses the OAuth-authenticated client, not the service account — see client.ts for why.
  const drive = getDriveUploadClient();
  const fileName = buildPhotoFileName(sku);

  const created = await drive.files.create({
    // `sku.trim().toUpperCase()` matches the key format getAllParts() builds from the
    // Parts sheet, so the lookup in listPhotosGroupedBySku's caller lines up exactly.
    requestBody: {
      name: fileName,
      parents: [env.googleDriveFolderId!],
      properties: { sku: sku.trim().toUpperCase() },
    },
    media: { mimeType: 'image/jpeg', body: Readable.from(buffer) },
    fields: 'id, name, createdTime',
  });

  const fileId = created.data.id;
  if (!fileId) throw new Error('Google Drive did not return a file id for the uploaded photo.');

  // Photos are shared "anyone with the link" so they can be displayed via <img src>
  // without a private-proxy route — acceptable for parts destined for a public eBay listing.
  await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });

  return {
    fileId,
    fileName,
    url: buildImageUrl(fileId),
    uploadedAt: created.data.createdTime ?? new Date().toISOString(),
  };
}

// Trashes rather than permanently deletes — recoverable from Drive's trash if someone
// removes a photo by mistake. Must use the OAuth client, not the service account: photos
// are owned by the OAuth-authenticated account (see uploadPhoto), and the service account
// only has reader access via the shared folder, not edit rights over files it doesn't own.
export async function deletePhoto(fileId: string): Promise<void> {
  const drive = getDriveUploadClient();
  await drive.files.update({ fileId, requestBody: { trashed: true } });
}
