import { describe, expect, it } from 'vitest';
import { upcFor } from './publishService.js';

describe('the listing UPC', () => {
  it('says "Does not apply" when there is no UPC', () => {
    expect(upcFor([{ name: 'Brand', values: ['Fleetguard'] }])).toBe('Does not apply');
  });

  it('says "Does not apply" for the agent\'s placeholders', () => {
    expect(upcFor([{ name: 'UPC', values: ['Not Available'] }])).toBe('Does not apply');
    expect(upcFor([{ name: 'upc', values: ['N/A'] }])).toBe('Does not apply');
  });

  it('passes a real barcode through, spaces and all', () => {
    expect(upcFor([{ name: 'UPC', values: ['0 12345 67890 5'] }])).toBe('012345678905');
    expect(upcFor([{ name: ' UPC ', values: ['4006381333931'] }])).toBe('4006381333931');
  });
});
