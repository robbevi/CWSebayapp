import type { InventoryPart } from '@warehouse/shared';
import { deriveStatus } from '@warehouse/shared';

const SITES = ['NDPARTS - Williston Parts', 'TXPARTS - Odessa'];
const BINS = ['A-1-4', 'BELT2', 'AF1-4'];
const MFRS = ['Caterpillar', 'Napa', 'M&M Fasteners'];
const CONDITIONS = ['New', 'LikeNew', 'Good', 'Fair', 'Poor', 'ForParts'];

export const MOCK_PARTS: InventoryPart[] = Array.from({ length: 24 }).map((_, i) => {
  const base = {
    id: `mock-${i}`,
    sku: `SKU${1000 + i}`,
    description: `Part ${i} — sample description`,
    manufacturer: MFRS[i % MFRS.length],
    inventorySite: SITES[i % SITES.length],
    binLocation: BINS[i % BINS.length],
    qoh: (i % 7) + 1,
    confirmedQoh: i % 4 === 0 ? (i % 7) + 1 : null,
    notes: '',
    boxCondition: i % 3 === 0 ? CONDITIONS[i % CONDITIONS.length] : undefined,
    photographed: i % 5 === 0,
    itemListed: i % 8 === 0,
    itemListedDate: null as string | null,
    transferredToMarketRecovery: i % 6 === 0,
    catalogingStartDate: null as string | null,
    legacyPartId: `legacy-${i}`,
    importSequenceNumber: i,
    photos: [],
    updatedAt: new Date().toISOString(),
  };
  return { ...base, workflowStatus: deriveStatus(base) };
});
