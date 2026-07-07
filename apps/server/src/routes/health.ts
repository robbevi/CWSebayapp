import { Router } from 'express';
import type { HealthStatus } from '@warehouse/shared';
import { isGoogleConfigured, isGraphConfigured } from '../config/env.js';
import { getResolvedContext } from '../graph/siteResolver.js';
import { checkAccess as checkSheetsAccess } from '../google/sheetsService.js';
import { checkAccess as checkDriveAccess } from '../google/driveService.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  if (isGoogleConfigured()) {
    try {
      await Promise.all([checkSheetsAccess(), checkDriveAccess()]);
      const body: HealthStatus = { backend: 'google', configured: true, resolved: true };
      res.json(body);
    } catch (err) {
      const body: HealthStatus = { backend: 'google', configured: true, resolved: false, error: (err as Error).message };
      res.json(body);
    }
    return;
  }

  if (isGraphConfigured()) {
    try {
      await getResolvedContext();
      const body: HealthStatus = { backend: 'sharepoint', configured: true, resolved: true };
      res.json(body);
    } catch (err) {
      const body: HealthStatus = {
        backend: 'sharepoint',
        configured: true,
        resolved: false,
        error: (err as Error).message,
      };
      res.json(body);
    }
    return;
  }

  const body: HealthStatus = { backend: 'none', configured: false, resolved: false };
  res.json(body);
});
