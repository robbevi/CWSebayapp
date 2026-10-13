import { Router } from 'express';
import { CSV_BOM, inventoryCsv, type InventoryPart } from '@warehouse/shared';
import { isGoogleConfigured, isGraphConfigured } from '../config/env.js';
import { getAllParts as getAllPartsGraph } from '../graph/partsService.js';
import { getAllParts as getAllPartsGoogle } from '../google/sheetsService.js';
import { MOCK_PARTS } from '../lib/mockData.js';

export const exportRouter = Router();

async function loadParts(): Promise<InventoryPart[]> {
  if (isGoogleConfigured()) return getAllPartsGoogle();
  if (isGraphConfigured()) return getAllPartsGraph();
  return MOCK_PARTS;
}

exportRouter.get('/export', async (_req, res, next) => {
  try {
    const parts = await loadParts();
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="calfrac-inventory-${stamp}.csv"`);
    res.send(`${CSV_BOM}${inventoryCsv(parts)}`);
  } catch (err) {
    next(err);
  }
});
