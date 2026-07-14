import { chicagoDateString, mondayOf, type Submission } from '@warehouse/shared';

export type Period = 'day' | 'week' | 'month';

function bucketKey(iso: string, period: Period): string {
  const day = chicagoDateString(iso);
  if (period === 'day') return day;
  if (period === 'week') return mondayOf(day);
  return day.slice(0, 7);
}

function todayKey(period: Period): string {
  return bucketKey(new Date().toISOString(), period);
}

// Counts per user for whichever bucket "now" falls into — the data behind the
// rotating Day/Week/Month chart.
export function countsForPeriod(submissions: Submission[], period: Period): Map<string, number> {
  const key = todayKey(period);
  const counts = new Map<string, number>();
  for (const s of submissions) {
    if (bucketKey(s.completedAt, period) !== key) continue;
    counts.set(s.user, (counts.get(s.user) ?? 0) + 1);
  }
  return counts;
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
}

function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

function buildHistory(dayCounts: Map<string, number>, numDays: number): { date: string; count: number }[] {
  const today = chicagoDateString(new Date().toISOString());
  const out: { date: string; count: number }[] = [];
  for (let i = numDays - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    out.push({ date, count: dayCounts.get(date) ?? 0 });
  }
  return out;
}

export interface UserMetrics {
  total: number;
  daysActive: number;
  currentStreak: number;
  avgPerDay: number;
  avgPerWeek: number;
  avgPerMonth: number;
  bestDay: number;
  bestWeek: number;
  bestMonth: number;
  history: { date: string; count: number }[];
}

// All derived from the raw submission log rather than a handful of fixed backend
// aggregates — adding a new metric later is just more arithmetic here, no API change.
export function computeUserMetrics(submissions: Submission[], userName: string): UserMetrics {
  const mine = submissions.filter((s) => s.user === userName);
  const today = chicagoDateString(new Date().toISOString());

  if (mine.length === 0) {
    return {
      total: 0,
      daysActive: 0,
      currentStreak: 0,
      avgPerDay: 0,
      avgPerWeek: 0,
      avgPerMonth: 0,
      bestDay: 0,
      bestWeek: 0,
      bestMonth: 0,
      history: buildHistory(new Map(), 30),
    };
  }

  const dayCounts = new Map<string, number>();
  const weekCounts = new Map<string, number>();
  const monthCounts = new Map<string, number>();

  for (const s of mine) {
    const day = chicagoDateString(s.completedAt);
    const week = mondayOf(day);
    const month = day.slice(0, 7);
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    weekCounts.set(week, (weekCounts.get(week) ?? 0) + 1);
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
  }

  const firstDay = [...dayCounts.keys()].sort()[0];
  const calendarDaysElapsed = Math.max(1, daysBetween(firstDay, today) + 1);
  const weeksElapsed = Math.max(1, calendarDaysElapsed / 7);
  const monthsElapsed = Math.max(1, monthsBetween(firstDay, today) + 1);

  let currentStreak = 0;
  let cursor = today;
  while (dayCounts.has(cursor)) {
    currentStreak++;
    cursor = addDays(cursor, -1);
  }

  return {
    total: mine.length,
    daysActive: dayCounts.size,
    currentStreak,
    avgPerDay: mine.length / calendarDaysElapsed,
    avgPerWeek: mine.length / weeksElapsed,
    avgPerMonth: mine.length / monthsElapsed,
    bestDay: Math.max(...dayCounts.values()),
    bestWeek: Math.max(...weekCounts.values()),
    bestMonth: Math.max(...monthCounts.values()),
    history: buildHistory(dayCounts, 30),
  };
}
