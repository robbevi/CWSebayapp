import { Router } from 'express';
import type { CreatePartInput, InventoryPartPatch } from '@warehouse/shared';
import { isGoogleConfigured, isGraphConfigured } from '../config/env.js';
import {
  createPart as createPartGraph,
  deletePart as deletePartGraph,
  getAllParts as getAllPartsGraph,
  getPartById as getPartByIdGraph,
  updatePart as updatePartGraph,
} from '../graph/partsService.js';
import {
  createPart as createPartGoogle,
  deletePart as deletePartGoogle,
  getAllParts as getAllPartsGoogle,
  getPartBySku as getPartBySkuGoogle,
  updatePart as updatePartGoogle,
} from '../google/sheetsService.js';
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

partsRouter.post('/parts', async (req, res, next) => {
  try {
    const body = req.body as CreatePartInput;
    const sku = (body.sku ?? '').trim();
    if (!sku) {
      res.status(400).json({ error: 'SKU is required.' });
      return;
    }

    const fields = {
      sku,
      binLocation: body.binLocation?.trim() || undefined,
      qoh: body.qoh,
      manufacturer: body.manufacturer?.trim() || undefined,
      inventorySite: body.inventorySite?.trim() || undefined,
    };

    if (isGoogleConfigured()) {
      const existing = await getAllPartsGoogle();
      if (existing.some((p) => p.sku.toUpperCase() === sku.toUpperCase())) {
        res.status(409).json({ error: `A part with SKU "${sku}" already exists.` });
        return;
      }
      await createPartGoogle(fields);
      res.status(201).json(await getPartBySkuGoogle(sku));
      return;
    }
    if (isGraphConfigured()) {
      const existing = await getAllPartsGraph();
      if (existing.some((p) => p.sku.toUpperCase() === sku.toUpperCase())) {
        res.status(409).json({ error: `A part with SKU "${sku}" already exists.` });
        return;
      }
      const id = await createPartGraph(fields);
      res.status(201).json(await getPartByIdGraph(id));
      return;
    }
    res.status(503).json({ error: 'No data backend is configured for this environment.' });
  } catch (err) {
    next(err);
  }
});

partsRouter.patch('/parts/:id', async (req, res, next) => {
  try {
    const { submittedBy, ...patch } = req.body as InventoryPartPatch & { submittedBy?: string };
    if (isGoogleConfigured()) {
      res.json(await updatePartGoogle(req.params.id, patch, submittedBy));
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

partsRouter.delete('/parts/:id', async (req, res, next) => {
  try {
    if (isGoogleConfigured()) {
      await deletePartGoogle(req.params.id);
      res.status(204).end();
      return;
    }
    if (isGraphConfigured()) {
      await deletePartGraph(req.params.id);
      res.status(204).end();
      return;
    }
    res.status(503).json({ error: 'No data backend is configured for this environment.' });
  } catch (err) {
    next(err);
  }
});
