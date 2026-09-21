import { Router } from 'express';
import { groupPartsBySku, type ResearchResult } from '@warehouse/shared';
import { isResearchConfigured, latestResearch, requestResearch } from '../ebay/researchService.js';
import { getAllParts } from '../google/sheetsService.js';

export const researchRouter = Router();

// Without a workflow URL there is nothing to call, so the routes don't exist.
researchRouter.use('/parts/:id/research', (_req, res, next) => {
  if (isResearchConfigured()) next();
  else res.status(404).json({ error: 'Copilot research is not configured here.' });
});

async function findGroup(partId: string) {
  return groupPartsBySku(await getAllParts()).find((g) => g.records.some((r) => r.id === partId));
}

/** Sends the part to the Copilot workflow. Returns at once; the reply arrives minutes later. */
researchRouter.post('/parts/:id/research', async (req, res, next) => {
  try {
    const group = await findGroup(req.params.id);
    if (!group) {
      res.status(404).json({ error: 'Part not found.' });
      return;
    }
    res.json(await requestResearch(group));
  } catch (err) {
    next(err);
  }
});

/** The newest research saved for the part, parsed, or `{ found: false }`. */
researchRouter.get('/parts/:id/research', async (req, res, next) => {
  try {
    const group = await findGroup(req.params.id);
    if (!group) {
      res.status(404).json({ error: 'Part not found.' });
      return;
    }
    const result: ResearchResult = (await latestResearch(group.sku)) ?? { found: false };
    res.json(result);
  } catch (err) {
    next(err);
  }
});
