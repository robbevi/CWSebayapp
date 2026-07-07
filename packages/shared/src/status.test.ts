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

  it('is Completed when all 5 checkpoints are set', () => {
    expect(deriveStatus({ ...fullChecks, photos: [] })).toBe('Completed');
  });
});
