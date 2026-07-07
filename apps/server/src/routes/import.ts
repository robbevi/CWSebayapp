import { Router } from 'express';
import multer from 'multer';
import { isGoogleConfigured, isGraphConfigured } from '../config/env.js';
import {
  createPart as createPartGraph,
  getAllParts as getAllPartsGraph,
  updatePartFields as updatePartFieldsGraph,
} from '../graph/partsService.js';
import {
  createPart as createPartGoogle,
  getAllParts as getAllPartsGoogle,
  updatePartFields as updatePartFieldsGoogle,
} from '../google/sheetsService.js';
import { parseInventoryCsv } from '../lib/csv.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const importRouter = Router();

importRouter.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    const useGoogle = isGoogleConfigured();
    if (!useGoogle && !isGraphConfigured()) {
      res.status(503).json({ error: 'Import is not configured for this environment.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'CSV file is required.' });
      return;
    }

    const getAllParts = useGoogle ? getAllPartsGoogle : getAllPartsGraph;
    const updatePartFields = useGoogle ? updatePartFieldsGoogle : updatePartFieldsGraph;
    const createPart = useGoogle ? createPartGoogle : createPartGraph;

    const rows = parseInventoryCsv(req.file.buffer.toString('utf-8'));
    const existing = await getAllParts();

    const byKey = new Map<string, string>();
    for (const p of existing) {
      byKey.set(`sku:${p.sku.toUpperCase()}`, p.id);
      if (p.legacyPartId) byKey.set(`legacy:${p.legacyPartId}`, p.id);
    }

    let created = 0;
    let updated = 0;
    const errors: { sku: string; error: string }[] = [];

    for (const row of rows) {
      try {
        const existingId =
          (row.legacyPartId && byKey.get(`legacy:${row.legacyPartId}`)) || byKey.get(`sku:${row.sku.toUpperCase()}`);

        if (existingId) {
          await updatePartFields(existingId, row);
          updated++;
        } else {
          await createPart(row);
          created++;
        }
      } catch (err) {
        errors.push({ sku: row.sku, error: (err as Error).message });
      }
    }

    res.json({ totalRows: rows.length, created, updated, errors });
  } catch (err) {
    next(err);
  }
});
