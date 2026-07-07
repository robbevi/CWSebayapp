import { Router } from 'express';
import type { InventoryPartPatch } from '@warehouse/shared';
import { isGoogleConfigured, isGraphConfigured } from '../config/env.js';
import { getAllParts as getAllPartsGraph, updatePart as updatePartGraph } from '../graph/partsService.js';
import { getAllParts as getAllPartsGoogle, updatePart as updatePartGoogle } from '../google/sheetsService.js';
import { MOCK_PARTS } from '../lib/mockData.js';

export const partsRouter = Router();

partsRouter.get('/parts', async (_req, res, next) => {
  try {
    if (isGoogleConfigured()) {
      res.json(await getAllPartsGoogle());
      return;
    }
    if (isGraphConfigured()) {
      res.json(await getAllPartsGraph());
      return;
    }
    res.json(MOCK_PARTS);
  } catch (err) {
    next(err);
  }
});

partsRouter.patch('/parts/:id', async (req, res, next) => {
  try {
    const patch = req.body as InventoryPartPatch;
    if (isGoogleConfigured()) {
      res.json(await updatePartGoogle(req.params.id, patch));
      return;
    }
    if (isGraphConfigured()) {
      res.json(await updatePartGraph(req.params.id, patch));
      return;
    }
    res.status(503).json({ error: 'No data backend is configured for this environment.' });
  } catch (err) {
    next(err);
  }
});
