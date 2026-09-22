import { Router } from 'express';
import { groupPartsBySku, type ResearchResult } from '@warehouse/shared';
import { backlogGroups, batchStatus, startBatch, stopBatch } from '../ebay/researchBatch.js';
import { isResearchConfigured, latestResearch, requestResearch } from '../ebay/researchService.js';
import { requireAdmin } from '../middleware/auth.js';
import { getAllParts } from '../google/sheetsService.js';

export const researchRouter = Router();

// Without a workflow URL there is nothing to call, so the routes don't exist.
researchRouter.use(['/parts/:id/research', '/research/backlog'], (_req, res, next) => {
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

/**
 * The backlog run: how it is going, and how many parts are still waiting. Admins only —
 * it commits the Copilot workflow to hours of work.
 */
researchRouter.get('/research/backlog', requireAdmin, async (_req, res, next) => {
  try {
    const status = batchStatus();
    // Counting the backlog reads Drive and the sheet; skip it while a run is using them.
    const waiting = status.running ? status.backlog - status.sent : (await backlogGroups()).length;
    res.json({ ...status, waiting });
  } catch (err) {
    next(err);
  }
});

researchRouter.post('/research/backlog/start', requireAdmin, async (req, res) => {
  const asked = Number(req.body?.limit);
  const limit = Number.isFinite(asked) ? Math.min(Math.max(Math.trunc(asked), 1), 500) : 10;
  try {
    res.json(await startBatch(limit, req.user!.name));
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Could not start the run.' });
  }
});

researchRouter.post('/research/backlog/stop', requireAdmin, (req, res) => {
  res.json(stopBatch(req.user!.name));
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
