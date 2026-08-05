import { Router } from 'express';
import { isGoogleConfigured } from '../config/env.js';
import { getDiscrepancyLog } from '../google/sheetsService.js';

export const discrepanciesRouter = Router();

// The audit trail of counts that didn't reconcile. Live parts carry their current variance
// already; this is the historical record, which keeps the expected quantity as it stood at
// the moment of counting even after a later import changes it.
discrepanciesRouter.get('/discrepancies', async (_req, res, next) => {
  try {
    if (!isGoogleConfigured()) {
      res.status(503).json({ error: 'No data backend is configured for this environment.' });
      return;
    }
    res.json(await getDiscrepancyLog());
  } catch (err) {
    next(err);
  }
});
