import { Readable } from 'node:stream';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { makeThumbnail, THUMB_WIDTH, thumbnailFor } from './thumbnail.js';

/** A landscape photo carrying the camera's note to turn it a quarter right. */
const sideways = () =>
  sharp({ create: { width: 800, height: 600, channels: 3, background: '#c33' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();

describe('photo thumbnails', () => {
  it('turns a sideways photo upright, small, and without the note', async () => {
    const meta = await sharp(await makeThumbnail(await sideways())).metadata();
    expect(meta.width).toBe(THUMB_WIDTH);
    expect(meta.height).toBe(320);
    expect(meta.orientation ?? 1).toBe(1);
  });

  it('makes each one once', async () => {
    const original = await sideways();
    const open = vi.fn(async () => Readable.from([original]));
    const first = await thumbnailFor('same-photo', open);
    const again = await thumbnailFor('same-photo', open);
    expect(again).toBe(first);
    expect(open).toHaveBeenCalledTimes(1);
  });
});
