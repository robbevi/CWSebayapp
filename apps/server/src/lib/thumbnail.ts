import type { Readable } from 'node:stream';
import sharp from 'sharp';

/**
 * A small, upright copy of a photograph.
 *
 * Phone photos are stored as the camera took them — often sideways, with a note in the
 * file saying which way to turn it. Browsers read the note; Outlook doesn't, so an email
 * showing the original shows the part on its side. The thumbnail is turned for real and
 * the note dropped, and at a few kilobytes it is also far lighter than the original.
 */

export const THUMB_WIDTH = 240;
const KEEP = 200;
const made = new Map<string, Buffer>();

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function makeThumbnail(original: Buffer): Promise<Buffer> {
  return sharp(original, { failOn: 'none' })
    .rotate()
    .resize({ width: THUMB_WIDTH, height: THUMB_WIDTH * 2, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** The thumbnail for a photo, made once and kept while the server runs. */
export async function thumbnailFor(key: string, open: () => Promise<Readable>): Promise<Buffer> {
  const kept = made.get(key);
  if (kept) return kept;
  const thumb = await makeThumbnail(await readAll(await open()));
  if (made.size >= KEEP) made.delete(made.keys().next().value!);
  made.set(key, thumb);
  return thumb;
}
