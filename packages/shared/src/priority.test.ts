import { describe, expect, it } from 'vitest';
import { isHighPriority, isPositiveMargin } from './types.js';

describe('isHighPriority', () => {
  it('flags tiers 1 and 2', () => {
    expect(isHighPriority('1 - Highest Priority')).toBe(true);
    expect(isHighPriority('2 - High Priority')).toBe(true);
  });

  it('does not flag lower tiers', () => {
    expect(isHighPriority('3 - Standard Priority')).toBe(false);
    expect(isHighPriority('4 - Low Dollar Review')).toBe(false);
  });

  it('is false for parts with no priority data', () => {
    expect(isHighPriority(undefined)).toBe(false);
    expect(isHighPriority(null)).toBe(false);
    expect(isHighPriority('')).toBe(false);
  });

  it('does not match a tier digit appearing later in the label', () => {
    expect(isHighPriority('Tier 1')).toBe(false);
    expect(isHighPriority('12 - Something')).toBe(false);
  });
});

describe('isPositiveMargin', () => {
  it('matches only the positive label', () => {
    expect(isPositiveMargin('Positive Gross Margin')).toBe(true);
    expect(isPositiveMargin('Negative Gross Margin')).toBe(false);
    expect(isPositiveMargin(undefined)).toBe(false);
  });
});
