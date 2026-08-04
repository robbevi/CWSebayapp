import { describe, expect, it } from 'vitest';
import { IRON_BARN_BINS } from './binLocations.js';

// Mirrors the substring filter ComboBox applies to its options.
const filter = (q: string) => IRON_BARN_BINS.filter((o) => o.toLowerCase().includes(q.trim().toLowerCase()));

describe('IRON_BARN_BINS', () => {
  it('covers a full 5-shelf, 5-deep grid per row', () => {
    expect(IRON_BARN_BINS).toHaveLength(26 * 5 * 5);
    expect(new Set(IRON_BARN_BINS).size).toBe(IRON_BARN_BINS.length);
  });

  it('runs A-1-1 through A-5-5 before starting row B', () => {
    expect(IRON_BARN_BINS[0]).toBe('A-1-1');
    expect(IRON_BARN_BINS[24]).toBe('A-5-5');
    expect(IRON_BARN_BINS[25]).toBe('B-1-1');
  });

  it('narrows to one shelf as the code is typed', () => {
    expect(filter('B-3')).toEqual(['B-3-1', 'B-3-2', 'B-3-3', 'B-3-4', 'B-3-5']);
    expect(filter('B-3-4')).toEqual(['B-3-4']);
  });

  it('shows a whole row for a bare letter', () => {
    expect(filter('C-')).toHaveLength(25);
  });
});
