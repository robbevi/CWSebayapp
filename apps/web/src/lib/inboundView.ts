import type { InboundItem } from '@warehouse/shared';

/**
 * How a district's stock on its way in is narrowed and ordered. One view, shared by the
 * district's board and the Inbound screen's packing list, so "Pack Multiple" opens on
 * exactly what the board was showing — and narrowing either narrows both.
 */

export const INBOUND_SORTS = ['Bin', 'SKU', 'Site', 'Manufacturer', 'Quantity', 'Unit cost', 'Value'] as const;
export type InboundSort = (typeof INBOUND_SORTS)[number];

export interface InboundView {
  search: string;
  sites: string[];
  bins: string[];
  makers: string[];
  sort: InboundSort;
}

export const DEFAULT_INBOUND_VIEW: InboundView = { search: '', sites: [], bins: [], makers: [], sort: 'Bin' };

export const inboundValue = (i: InboundItem) => (i.unitCost ?? 0) * i.qty;

const COMPARE: Record<InboundSort, (a: InboundItem, b: InboundItem) => number> = {
  Bin: (a, b) => a.originSite.localeCompare(b.originSite) || a.originBin.localeCompare(b.originBin) || a.sku.localeCompare(b.sku),
  SKU: (a, b) => a.sku.localeCompare(b.sku),
  Site: (a, b) => a.originSite.localeCompare(b.originSite) || a.sku.localeCompare(b.sku),
  Manufacturer: (a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.sku.localeCompare(b.sku),
  // Bigger first: these are read for what is worth most.
  Quantity: (a, b) => b.qty - a.qty,
  'Unit cost': (a, b) => (b.unitCost ?? -1) - (a.unitCost ?? -1),
  Value: (a, b) => inboundValue(b) - inboundValue(a),
};

/** The items the view lets through, in its order. */
export function applyInboundView(items: InboundItem[], v: InboundView): InboundItem[] {
  const needle = v.search.trim().toLowerCase();
  return items
    .filter((i) => v.sites.length === 0 || v.sites.includes(i.originSite))
    .filter((i) => v.bins.length === 0 || v.bins.includes(i.originBin))
    .filter((i) => v.makers.length === 0 || v.makers.includes(i.manufacturer))
    .filter(
      (i) => !needle || [i.sku, i.description, i.manufacturer, i.originSite, i.originBin, i.crate].some((x) => x.toLowerCase().includes(needle))
    )
    .sort(COMPARE[v.sort]);
}

/** The view's filters as removable chips. */
export function inboundChips(v: InboundView, set: (patch: Partial<InboundView>) => void) {
  return [
    ...v.sites.map((x) => ({ key: `site:${x}`, label: `Site: ${x}`, remove: () => set({ sites: v.sites.filter((y) => y !== x) }) })),
    ...v.bins.map((x) => ({ key: `bin:${x}`, label: `Bin: ${x}`, remove: () => set({ bins: v.bins.filter((y) => y !== x) }) })),
    ...v.makers.map((x) => ({ key: `mfr:${x}`, label: x, remove: () => set({ makers: v.makers.filter((y) => y !== x) }) })),
  ];
}

export const uniqueSorted = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
export const countBy = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
