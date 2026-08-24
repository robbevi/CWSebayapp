import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSales, fetchSalesStatus, syncSales } from '../lib/api';
import { useToastStore } from '../state/useToastStore';

export const SALES_QUERY_KEY = ['sales'];

export function useSales() {
  return useQuery({
    queryKey: SALES_QUERY_KEY,
    queryFn: fetchSales,
    refetchInterval: 60_000,
  });
}

export function useSalesStatus() {
  return useQuery({ queryKey: ['sales-status'], queryFn: fetchSalesStatus, staleTime: 5 * 60_000 });
}

export function useSyncSales() {
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.show);

  return useMutation({
    mutationFn: (days?: number) => syncSales(days),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: SALES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ['listings'] });
      const parts = [`${result.added} new`, `${result.updated} updated`];
      // Worth saying out loud: those figures will move once eBay posts the fee records.
      if (result.estimatedFees > 0) parts.push(`${result.estimatedFees} with estimated fees`);
      const listings = result.listingsError
        ? '; listings failed'
        : result.listings > 0
          ? `; ${result.listings} listings refreshed`
          : '';
      toast(`Synced ${result.fetched} sales — ${parts.join(', ')}${listings}`);
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Sales sync failed', 'error'),
  });
}
