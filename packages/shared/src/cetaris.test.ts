import { describe, expect, it } from 'vitest';
import { cetarisDone, cetarisNeeded, cetarisPending, isCetarisSaleNumber, saleComplete } from './sales.js';

describe('isCetarisSaleNumber', () => {
  it('takes exactly seven digits', () => {
    expect(isCetarisSaleNumber('1234567')).toBe(true);
    expect(isCetarisSaleNumber(' 1234567 ')).toBe(true);
  });

  it('turns away anything else', () => {
    for (const bad of ['123456', '12345678', '12a4567', '', '123 4567', 1234567, null]) {
      expect(isCetarisSaleNumber(bad), String(bad)).toBe(false);
    }
  });
});

describe('a Part Sale', () => {
  const started = { cetarisSaleNumber: '3087786' };
  const completed = { ...started, cetarisCompletedAt: '2026-10-16T15:00:00Z' };

  it('is needed until it has a number', () => {
    expect(cetarisNeeded({})).toBe(true);
    expect(cetarisNeeded(started)).toBe(false);
  });

  it('is pending once started, until it is completed', () => {
    expect(cetarisPending(started)).toBe(true);
    expect(cetarisDone(started)).toBe(false);
    expect(cetarisPending(completed)).toBe(false);
    expect(cetarisDone(completed)).toBe(true);
  });

  it('finishes a sale only once completed and paid out', () => {
    expect(saleComplete({ ...started, payoutId: 'P1' })).toBe(false);
    expect(saleComplete({ ...completed })).toBe(false);
    expect(saleComplete({ ...completed, payoutId: 'P1' })).toBe(true);
  });
});
