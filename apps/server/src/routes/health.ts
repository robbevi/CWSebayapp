import { Router } from 'express';
import type { HealthStatus } from '@warehouse/shared';
import { appUsersProblem, env, isGoogleConfigured, isGraphConfigured } from '../config/env.js';
import { getResolvedContext } from '../graph/siteResolver.js';
import { checkAccess as checkSheetsAccess } from '../google/sheetsService.js';
import { checkAccess as checkDriveAccess } from '../google/driveService.js';

export const healthRouter = Router();

// Surfaced so an empty roster can be spotted from the health endpoint rather than only
// by noticing the user picker is blank.
healthRouter.get('/health/users', (_req, res) => {
  res.json({
    count: env.appUsers.length,
    roles: env.appUsers.reduce<Record<string, number>>((acc, u) => {
      acc[u.role] = (acc[u.role] ?? 0) + 1;
      return acc;
    }, {}),
    problem: appUsersProblem ?? null,
  });
});

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
