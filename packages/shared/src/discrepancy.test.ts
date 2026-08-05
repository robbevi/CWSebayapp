import { describe, expect, it } from 'vitest';
import { formatVariance, getDiscrepancy, hasDiscrepancy } from './discrepancy.js';

describe('getDiscrepancy', () => {
  it('is null until somebody has counted', () => {
    expect(getDiscrepancy({ qoh: 5, confirmedQoh: null })).toBeNull();
    expect(getDiscrepancy({ qoh: 5, confirmedQoh: undefined })).toBeNull();
  });

  it('reports a shortage when fewer are on the shelf', () => {
    expect(getDiscrepancy({ qoh: 5, confirmedQoh: 3 })).toEqual({ variance: -2, kind: 'shortage' });
  });

  it('reports an overage when more are on the shelf', () => {
    expect(getDiscrepancy({ qoh: 2, confirmedQoh: 5 })).toEqual({ variance: 3, kind: 'overage' });
  });

  it('separates "expected some, found none" from an ordinary shortage', () => {
    expect(getDiscrepancy({ qoh: 3, confirmedQoh: 0 })).toEqual({ variance: -3, kind: 'notFound' });
  });

  it('is clean when the count matches', () => {
    expect(getDiscrepancy({ qoh: 4, confirmedQoh: 4 })).toEqual({ variance: 0, kind: 'none' });
  });

  it('counting zero against an expected zero is not a discrepancy', () => {
    expect(getDiscrepancy({ qoh: 0, confirmedQoh: 0 })).toEqual({ variance: 0, kind: 'none' });
  });
});

describe('hasDiscrepancy', () => {
  it('is false for uncounted and for matching counts', () => {
    expect(hasDiscrepancy({ qoh: 5, confirmedQoh: null })).toBe(false);
    expect(hasDiscrepancy({ qoh: 5, confirmedQoh: 5 })).toBe(false);
  });

  it('is true for any non-zero variance', () => {
    expect(hasDiscrepancy({ qoh: 5, confirmedQoh: 3 })).toBe(true);
    expect(hasDiscrepancy({ qoh: 3, confirmedQoh: 0 })).toBe(true);
    expect(hasDiscrepancy({ qoh: 1, confirmedQoh: 4 })).toBe(true);
  });
});

describe('formatVariance', () => {
  it('always carries a sign', () => {
    expect(formatVariance(-2)).toBe('-2');
    expect(formatVariance(3)).toBe('+3');
  });
});
