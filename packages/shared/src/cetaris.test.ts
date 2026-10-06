import { describe, expect, it } from 'vitest';
import { cetarisDone, isCetarisSaleNumber } from './sales.js';

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

describe('cetarisDone', () => {
  it('counts a sale finished once it carries a number', () => {
    expect(cetarisDone({ cetarisSaleNumber: '1234567' })).toBe(true);
    expect(cetarisDone({})).toBe(false);
  });
});
