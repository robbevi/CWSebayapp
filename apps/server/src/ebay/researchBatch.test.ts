import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartRecord } from '@warehouse/shared';

const files = vi.hoisted(() => ({ list: vi.fn() }));
const parts = vi.hoisted(() => ({ getAllParts: vi.fn() }));
const research = vi.hoisted(() => ({ requestResearch: vi.fn(), isResearchConfigured: () => true }));

vi.mock('../google/client.js', () => ({ getDriveUploadClient: () => ({ files: files }) }));
vi.mock('../google/sheetsService.js', () => parts);
vi.mock('./researchService.js', () => research);

const { backlogGroups, batchStatus, researchedSkus, startBatch, stopBatch } = await import('./researchBatch.js');

/** A part ready to list: photographed, counted, graded, not yet on eBay. */
function ready(sku: string, over: Partial<PartRecord> = {}): PartRecord {
  return {
    id: `id-${sku}`,
    sku,
    description: `PART ${sku}`,
    manufacturer: 'Parker',
    inventorySite: 'NDPARTS',
    binLocation: 'C-4-5',
    qoh: 1,
    confirmedQoh: 1,
    itemCondition: 'New',
    photographed: true,
    photos: [{ id: 'p1', url: '/api/photos/p1/content', name: 'p1.jpg' }],
    activeRecoveryPriceBasis: 100,
    itemListed: false,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  } as unknown as PartRecord;
}

const listing = (names: string[], nextPageToken?: string) => ({
  data: { files: names.map((name) => ({ id: name, name })), nextPageToken },
});

beforeEach(() => {
  vi.clearAllMocks();
  stopBatch('test');
});

describe('researchedSkus', () => {
  it('reads every page, and takes the SKU off the file name', async () => {
    files.list.mockResolvedValueOnce(listing(['ABC-1.md', 'DEF-2.md'], 'more')).mockResolvedValueOnce(listing(['GHI-3.md']));
    expect([...(await researchedSkus())]).toEqual(['abc-1', 'def-2', 'ghi-3']);
    expect(files.list).toHaveBeenCalledTimes(2);
  });
});

describe('backlogGroups', () => {
  it('keeps only parts ready to list that have no research yet', async () => {
    parts.getAllParts.mockResolvedValue([
      ready('READY-1'),
      ready('DONE-1'),
      ready('LISTED-1', { itemListed: true, ebayListingId: '123' }),
      ready('NOPHOTO-1', { photographed: false, photos: [] }),
      ready('NOCOUNT-1', { confirmedQoh: undefined }),
      ready('NOGRADE-1', { itemCondition: '' }),
    ]);
    files.list.mockResolvedValue(listing(['done-1.md']));

    expect((await backlogGroups()).map((g) => g.sku)).toEqual(['READY-1']);
  });

  it('matches names case-insensitively, so DONE-1.md covers done-1', async () => {
    parts.getAllParts.mockResolvedValue([ready('Done-1')]);
    files.list.mockResolvedValue(listing(['DONE-1.md']));
    expect(await backlogGroups()).toEqual([]);
  });
});

describe('a run', () => {
  it('refuses to start a second run while one is going', async () => {
    parts.getAllParts.mockResolvedValue([ready('A-1'), ready('B-2')]);
    files.list.mockResolvedValue(listing([]));
    research.requestResearch.mockResolvedValue({ requestedAt: '2026-09-22T00:00:00.000Z' });

    const status = await startBatch(2, 'Rob Bevilacqua');
    expect(status).toMatchObject({ running: true, limit: 2, backlog: 2, startedBy: 'Rob Bevilacqua' });
    await expect(startBatch(2, 'Rob Bevilacqua')).rejects.toThrow(/already going/);
  });

  it('sends no more than it was asked for', async () => {
    parts.getAllParts.mockResolvedValue([ready('A-1'), ready('B-2'), ready('C-3')]);
    files.list.mockResolvedValue(listing([]));
    research.requestResearch.mockResolvedValue({ requestedAt: '2026-09-22T00:00:00.000Z' });

    await startBatch(1, 'Rob Bevilacqua');
    await vi.waitFor(() => expect(research.requestResearch).toHaveBeenCalledTimes(1));
    expect(research.requestResearch.mock.calls[0][0].sku).toBe('A-1');
  });

  it('stops the run when the workflow refuses a part, and remembers why', async () => {
    parts.getAllParts.mockResolvedValue([ready('A-1'), ready('B-2')]);
    files.list.mockResolvedValue(listing([]));
    research.requestResearch.mockRejectedValue(new Error("Couldn't reach the Copilot research workflow."));

    await startBatch(2, 'Rob Bevilacqua');
    await vi.waitFor(() => expect(batchStatus().running).toBe(false));
    expect(batchStatus()).toMatchObject({
      sent: 0,
      failed: [{ sku: 'A-1', error: "Couldn't reach the Copilot research workflow." }],
    });
    expect(research.requestResearch).toHaveBeenCalledTimes(1);
  });

  it('records who stopped it', async () => {
    parts.getAllParts.mockResolvedValue([ready('A-1')]);
    files.list.mockResolvedValue(listing([]));
    research.requestResearch.mockResolvedValue({ requestedAt: '2026-09-22T00:00:00.000Z' });

    await startBatch(1, 'Rob Bevilacqua');
    expect(stopBatch('Jeremiah Busch')).toMatchObject({ running: false, stoppedBy: 'Jeremiah Busch' });
  });
});
