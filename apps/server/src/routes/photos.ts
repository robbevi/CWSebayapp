import { Router } from 'express';
import multer from 'multer';
import { isGraphConfigured } from '../config/env.js';
import { markPhotographed } from '../graph/partsService.js';
import { uploadPhoto } from '../graph/photosService.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

export const photosRouter = Router();

photosRouter.post('/photos', upload.single('file'), async (req, res, next) => {
  try {
    if (!isGraphConfigured()) {
      res.status(503).json({ error: 'Photo upload is not configured for this environment. Set the Azure/SharePoint variables in .env.' });
      return;
    }
    const sku = (req.body?.sku as string | undefined)?.trim();
    const itemId = (req.body?.itemId as string | undefined)?.trim();
    if (!sku || !req.file) {
      res.status(400).json({ error: 'sku and file are required.' });
      return;
    }

    const photo = await uploadPhoto(sku, req.file.buffer);
    if (itemId) {
      await markPhotographed(itemId).catch((err) => console.error('Failed to flag Item Photographed:', err));
    }
    res.json(photo);
  } catch (err) {
    next(err);
  }
});
