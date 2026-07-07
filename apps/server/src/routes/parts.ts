import { Router } from 'express';
import type { InventoryPartPatch } from '@warehouse/shared';
import { isGraphConfigured } from '../config/env.js';
import { getAllParts, updatePart } from '../graph/partsService.js';
import { MOCK_PARTS } from '../lib/mockData.js';

export const partsRouter = Router();

partsRouter.get('/parts', async (_req, res, next) => {
  try {
    if (!isGraphConfigured()) {
      res.json(MOCK_PARTS);
      return;
    }
    const parts = await getAllParts();
    res.json(parts);
  } catch (err) {
    next(err);
  }
});

partsRouter.patch('/parts/:id', async (req, res, next) => {
  try {
    if (!isGraphConfigured()) {
      res.status(503).json({ error: 'Graph is not configured for this environment.' });
      return;
    }
    const patch = req.body as InventoryPartPatch;
    const updated = await updatePart(req.params.id, patch);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
