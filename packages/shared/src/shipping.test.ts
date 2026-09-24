import { describe, expect, it } from 'vitest';
import { FREE_SHIPPING_MAX_LB, FREE_SHIPPING_MIN_PRICE, packedWeightLb, suggestShipping } from './shipping.js';

const listing = (weightLb: number | null, weightOz: number | null, price: number | null) => ({
  weightLb,
  weightOz,
  price,
});

describe('packedWeightLb', () => {
  it('adds the ounces to the pounds', () => {
    expect(packedWeightLb(listing(2, 8, null))).toBe(2.5);
    expect(packedWeightLb(listing(null, 8, null))).toBe(0.5);
    expect(packedWeightLb(listing(3, null, null))).toBe(3);
  });

  it('is null when the agent weighed nothing', () => {
    expect(packedWeightLb(listing(null, null, null))).toBeNull();
  });
});

describe('suggestShipping', () => {
  it('offers free shipping on a light part worth enough to carry it', () => {
    expect(suggestShipping(listing(1, 0, 99))).toBe('free');
    expect(suggestShipping(listing(FREE_SHIPPING_MAX_LB, 0, FREE_SHIPPING_MIN_PRICE))).toBe('free');
  });

  it('charges for a heavy part however dear it is', () => {
    expect(suggestShipping(listing(FREE_SHIPPING_MAX_LB + 0.1, 0, 500))).toBe('paid');
  });

  it('charges on a cheap part, where postage is most of the price', () => {
    expect(suggestShipping(listing(1, 0, FREE_SHIPPING_MIN_PRICE - 0.01))).toBe('paid');
    expect(suggestShipping(listing(1, 0, null))).toBe('paid');
  });

  it('charges when the agent weighed nothing, rather than guessing free', () => {
    expect(suggestShipping(listing(null, null, 200))).toBe('paid');
  });
});
