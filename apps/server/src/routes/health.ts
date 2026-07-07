import { Router } from 'express';
import { isGraphConfigured } from '../config/env.js';
import { getResolvedContext } from '../graph/siteResolver.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const graphConfigured = isGraphConfigured();
  if (!graphConfigured) {
    res.json({ graphConfigured: false, siteResolved: false, listResolved: false, driveResolved: false });
    return;
  }
  try {
    const ctx = await getResolvedContext();
    res.json({
      graphConfigured: true,
      siteResolved: !!ctx.siteId,
      listResolved: !!ctx.listId,
      driveResolved: !!ctx.driveId,
    });
  } catch (err) {
    res.json({
      graphConfigured: true,
      siteResolved: false,
      listResolved: false,
      driveResolved: false,
      error: (err as Error).message,
    });
  }
});
