import { describe, expect, it } from 'vitest';
import { checkpointCount, deriveStatus } from './status.js';

const emptyChecks = {
  photographed: false,
  confirmedQoh: null,
  boxCondition: undefined,
  transferredToMarketRecovery: false,
  itemListed: false,
};

const fullChecks = {
  photographed: true,
  confirmedQoh: 3,
  boxCondition: 'Good',
  transferredToMarketRecovery: true,
  itemListed: true,
};

describe('checkpointCount', () => {
  it('counts zero when nothing is set', () => {
    expect(checkpointCount(emptyChecks)).toBe(0);
  });

  it('counts all five checkpoints', () => {
    expect(checkpointCount(fullChecks)).toBe(5);
  });

  it('treats confirmedQoh of 0 as set (not missing)', () => {
    expect(checkpointCount({ ...emptyChecks, confirmedQoh: 0 })).toBe(1);
  });
});

describe('deriveStatus', () => {
  it('is NotStarted when nothing is set and there are no photos', () => {
    expect(deriveStatus({ ...emptyChecks, photos: [] })).toBe('NotStarted');
  });

  it('is Processing once photos exist but nothing else is confirmed', () => {
    expect(deriveStatus({ ...emptyChecks, photos: [{ fileName: 'a.jpg', url: '', uploadedAt: '' }] })).toBe(
      'Processing'
    );
  });

  it('is Processing when partially complete', () => {
    expect(deriveStatus({ ...emptyChecks, photographed: true, photos: [] })).toBe('Processing');
  });

  it('is Listed as soon as it reaches eBay, before the other steps are done', () => {
    // The board's third column means "on eBay", not "everything ticked" — most listings go
    // up before condition or transfer is recorded, and they belong with the listings.
    expect(deriveStatus({ ...emptyChecks, itemListed: true, photos: [] })).toBe('Listed');
  });

  it('is Listed when every checkpoint is set, since listing is one of them', () => {
    expect(deriveStatus({ ...fullChecks, photos: [] })).toBe('Listed');
  });

  it('stays Processing while work is under way but nothing is listed', () => {
    expect(
      deriveStatus({
        ...emptyChecks,
        photographed: true,
        confirmedQoh: 3,
        boxCondition: 'Good',
        transferredToMarketRecovery: true,
        photos: [],
      })
    ).toBe('Processing');
  });
});
