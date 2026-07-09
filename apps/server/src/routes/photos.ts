import { Router } from 'express';
import multer from 'multer';
import { isGoogleConfigured, isGraphConfigured } from '../config/env.js';
import { setPhotographed as setPhotographedGraph } from '../graph/partsService.js';
import {
  deletePhoto as deletePhotoGraph,
  listPhotosGroupedBySku as listPhotosGroupedBySkuGraph,
  uploadPhoto as uploadPhotoGraph,
} from '../graph/photosService.js';
import { setPhotographed as setPhotographedGoogle } from '../google/sheetsService.js';
import {
  deletePhoto as deletePhotoGoogle,
  getPhotoContent,
  listPhotosGroupedBySku,
  uploadPhoto as uploadPhotoGoogle,
} from '../google/driveService.js';

// Uploads are no longer downscaled client-side (original quality is preserved), so this
// needs headroom for full-resolution phone camera photos.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 35 * 1024 * 1024 } });

export const photosRouter = Router();

photosRouter.post('/photos', upload.single('file'), async (req, res, next) => {
  try {
    if (!isGoogleConfigured() && !isGraphConfigured()) {
      res.status(503).json({
        error: 'Photo upload is not configured for this environment. Set the GOOGLE_* or AZURE_*/SHAREPOINT_* variables in .env.',
      });
      return;
    }
    const sku = (req.body?.sku as string | undefined)?.trim();
    const itemId = (req.body?.itemId as string | undefined)?.trim();
    if (!sku || !req.file) {
      res.status(400).json({ error: 'sku and file are required.' });
      return;
    }

    if (isGoogleConfigured()) {
      const photo = await uploadPhotoGoogle(sku, req.file.buffer);
      if (itemId) {
        await setPhotographedGoogle(itemId, true).catch((err) => console.error('Failed to flag photographed:', err));
      }
      res.json(photo);
      return;
    }

    const photo = await uploadPhotoGraph(sku, req.file.buffer);
    if (itemId) {
      await setPhotographedGraph(itemId, true).catch((err) => console.error('Failed to flag Item Photographed:', err));
    }
    res.json(photo);
  } catch (err) {
    next(err);
  }
});

// Streams photo bytes through our own server instead of the client hitting Google's
// URLs directly — see the comment above buildImageUrl in google/driveService.ts for why.
photosRouter.get('/photos/:fileId/content', async (req, res, next) => {
  try {
    if (!isGoogleConfigured()) {
      res.status(404).json({ error: 'Photo content proxy is only available for the Google backend.' });
      return;
    }
    const stream = await getPhotoContent(req.params.fileId);
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    stream.on('error', next).pipe(res);
  } catch (err) {
    next(err);
  }
});

photosRouter.delete('/photos/:fileId', async (req, res, next) => {
  try {
    if (!isGoogleConfigured() && !isGraphConfigured()) {
      res.status(503).json({ error: 'Photo delete is not configured for this environment.' });
      return;
    }
    const sku = (req.query.sku as string | undefined)?.trim();
    const itemId = (req.query.itemId as string | undefined)?.trim();

    if (isGoogleConfigured()) {
      await deletePhotoGoogle(req.params.fileId);
      if (sku) {
        const remaining = await listPhotosGroupedBySku();
        const stillHasPhotos = (remaining.get(sku.toUpperCase()) ?? []).length > 0;
        await setPhotographedGoogle(itemId ?? sku, stillHasPhotos).catch((err) =>
          console.error('Failed to sync photographed flag after delete:', err)
        );
      }
      res.status(204).end();
      return;
    }

    await deletePhotoGraph(req.params.fileId);
    if (sku) {
      const remaining = await listPhotosGroupedBySkuGraph();
      const stillHasPhotos = (remaining.get(sku.toUpperCase()) ?? []).length > 0;
      await setPhotographedGraph(itemId ?? sku, stillHasPhotos).catch((err) =>
        console.error('Failed to sync Item Photographed after delete:', err)
      );
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
