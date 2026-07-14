import { Router } from 'express';
import { chicagoDateString, mondayOf, type SubmissionSummary } from '@warehouse/shared';
import { env, isGoogleConfigured } from '../config/env.js';
import { getSubmissions } from '../google/sheetsService.js';

export const submissionsRouter = Router();

submissionsRouter.get('/submissions', async (_req, res, next) => {
  try {
    if (!isGoogleConfigured()) {
      res.status(503).json({ error: 'No data backend is configured for this environment.' });
      return;
    }
    res.json(await getSubmissions());
  } catch (err) {
    next(err);
  }
});

submissionsRouter.get('/submissions/summary', async (_req, res, next) => {
  try {
    if (!isGoogleConfigured()) {
      res.status(503).json({ error: 'No data backend is configured for this environment.' });
      return;
    }

    const submissions = await getSubmissions();
    const today = chicagoDateString(new Date().toISOString());
    const thisWeek = mondayOf(today);
    const thisMonth = today.slice(0, 7);

    const summary: SubmissionSummary[] = env.appUsers.map((u) => {
      const mine = submissions.filter((s) => s.user === u.name);
      const day = mine.filter((s) => chicagoDateString(s.completedAt) === today).length;
      const week = mine.filter((s) => mondayOf(chicagoDateString(s.completedAt)) === thisWeek).length;
      const month = mine.filter((s) => chicagoDateString(s.completedAt).slice(0, 7) === thisMonth).length;
      return { user: u.name, role: u.role, day, week, month };
    });

    res.json(summary);
  } catch (err) {
    next(err);
  }
});
