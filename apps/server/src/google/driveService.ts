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

export interface GroupedPhotos {
  /** Keyed by the owning row's stable partId. */
  byPartId: Map<string, Photo[]>;
  /** Photos predating partId, keyed by SKU — attached to that SKU's oldest row as a fallback. */
  legacyBySku: Map<string, Photo[]>;
  /**
   * Every photo that carries a SKU, indexed by it, including ones that also carry a
   * partId. A partId can go stale — photos taken while a row had no id of its own were
   * stamped with the SKU as the id, and the later backfill gave those rows real ones —
   * which strands the photo unless it can be found another way.
   */
  bySku: Map<string, Photo[]>;
}

export async function listPhotosGrouped(): Promise<GroupedPhotos> {
  const drive = getDriveClient();
  const byPartId = new Map<string, Photo[]>();
  const legacyBySku = new Map<string, Photo[]>();
  const bySku = new Map<string, Photo[]>();

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
      const photo: Photo = {
        fileId: file.id,
        partId: file.properties?.partId ?? undefined,
        fileName: file.name,
        url: buildImageUrl(file.id),
        uploadedAt: file.createdTime ?? new Date().toISOString(),
      };

      // partId is authoritative: the same SKU can now be stocked at several sites, so SKU
      // alone no longer identifies which row a photo belongs to. It also survives a site
      // being renamed, which plain SKU+site would not.
      // Indexed by SKU whatever else is known about it, so the fallback stays available.
      const declaredSku = file.properties?.sku ?? extractSkuFromFileName(file.name);
      if (declaredSku) {
        const k = declaredSku.toUpperCase();
        bySku.set(k, [...(bySku.get(k) ?? []), photo]);
      }

      const partId = file.properties?.partId;
      if (partId) {
        byPartId.set(partId, [...(byPartId.get(partId) ?? []), photo]);
        continue;
      }

      // Pre-partId photos. The SKU property is still lossless (the filename is not — it is
      // sanitized to [A-Za-z0-9-], so "AB.123" and "AB/123" collide); fall back to parsing
      // the name only for photos older than that property too.
      const sku = file.properties?.sku ?? extractSkuFromFileName(file.name);
      if (!sku) continue;
      const key = sku.toUpperCase();
      legacyBySku.set(key, [...(legacyBySku.get(key) ?? []), photo]);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return { byPartId, legacyBySku, bySku };
}

// Streams the raw file bytes for the photo content proxy route. Uses the service
// account (read-only, already has access via the shared folder) rather than the OAuth
// upload client, since reading doesn't hit the storage-quota restriction that uploads do.
export async function getPhotoContent(fileId: string): Promise<Readable> {
  const drive = getDriveClient();
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  return res.data as unknown as Readable;
}

export async function uploadPhoto(sku: string, buffer: Buffer, partId?: string, site?: string): Promise<Photo> {
  // Uses the OAuth-authenticated client, not the service account — see client.ts for why.
  const drive = getDriveUploadClient();
  const fileName = buildPhotoFileName(sku, site);

  const properties: Record<string, string> = { sku: sku.trim().toUpperCase() };
  if (partId) properties.partId = partId;
  if (site) properties.site = site.trim().toUpperCase();

  const created = await drive.files.create({
    requestBody: { name: fileName, parents: [env.googleDriveFolderId!], properties },
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
