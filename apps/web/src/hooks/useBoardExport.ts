import { useCallback } from 'react';
import { CSV_BOM, groupPartsBySku, indexListings, indexSales, inventoryCsv } from '@warehouse/shared';
import { boardRecords, isFiltered } from '../lib/boardView';
import { useUIStore } from '../state/useUIStore';
import { useInventoryParts } from './useInventoryParts';
import { useListings } from './useListings';
import { useResearchedSkus } from './useResearchedSkus';
import { useSales } from './useSales';

/**
 * The spreadsheet export of the board as it stands: the same filters, search, sort and
 * Listed / Sold choice, column by column. Built in the browser from what is already loaded,
 * at the moment it is asked for, so it is exactly what is on screen.
 */
export function useBoardExport(): { ready: boolean; download: () => void } {
  const { data: parts } = useInventoryParts();
  const { data: sales } = useSales();
  const { data: listings } = useListings();
  const researched = useResearchedSkus();

  const download = useCallback(() => {
    if (!parts) return;
    const filters = useUIStore.getState();
    const rows = boardRecords(
      {
        groups: groupPartsBySku(parts),
        researched,
        salesIndex: indexSales(sales ?? []),
        listingsIndex: indexListings(listings ?? []),
      },
      filters
    );
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `calfrac-inventory-${stamp}${isFiltered(filters) ? '-filtered' : ''}.csv`;
    const url = URL.createObjectURL(new Blob([CSV_BOM, inventoryCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Long enough for the browser to start saving; the file is small and in memory anyway.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, [parts, sales, listings, researched]);

  return { ready: !!parts, download };
}
