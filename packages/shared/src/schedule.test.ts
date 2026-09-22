import { describe, expect, it } from 'vitest';
import { SCHEDULE_MAX_DAYS, SCHEDULE_MIN_MINUTES, scheduleProblem } from './agentListing.js';

const now = new Date('2026-09-22T12:00:00.000Z');
const inMinutes = (m: number) => new Date(now.getTime() + m * 60_000).toISOString();

describe('scheduleProblem', () => {
  it('accepts a time inside eBay window', () => {
    expect(scheduleProblem(inMinutes(SCHEDULE_MIN_MINUTES), now)).toBeNull();
    expect(scheduleProblem(inMinutes(SCHEDULE_MAX_DAYS * 24 * 60), now)).toBeNull();
  });

  it('refuses a start too soon, including one in the past', () => {
    expect(scheduleProblem(inMinutes(59), now)).toMatch(/at least 60 minutes/);
    expect(scheduleProblem(inMinutes(-10), now)).toMatch(/at least 60 minutes/);
  });

  it('refuses a start further off than eBay allows', () => {
    expect(scheduleProblem(inMinutes(SCHEDULE_MAX_DAYS * 24 * 60 + 1), now)).toMatch(/21 days/);
  });

  it('refuses something that is not a time', () => {
    expect(scheduleProblem('next tuesday', now)).toMatch(/not a time/);
  });
});
