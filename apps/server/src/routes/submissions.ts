import { Router } from 'express';
import type { SubmissionSummary } from '@warehouse/shared';
import { env, isGoogleConfigured } from '../config/env.js';
import { getSubmissions } from '../google/sheetsService.js';

export const submissionsRouter = Router();

// en-CA formats as YYYY-MM-DD, which sorts/compares correctly as a plain string —
// convenient for the day/week/month bucketing below without a date library.
function chicagoDateString(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = d.getUTCDay();
  const diffToMonday = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
}

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
