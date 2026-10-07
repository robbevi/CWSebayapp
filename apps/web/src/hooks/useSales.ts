import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { clearCetarisSale, fetchSales, fetchSalesStatus, logCetarisSale, syncSales, syncSalesIfStale } from '../lib/api';
import { useToastStore } from '../state/useToastStore';

export const SALES_QUERY_KEY = ['sales'];

export function useSales() {
  return useQuery({
    queryKey: SALES_QUERY_KEY,
    queryFn: fetchSales,
    refetchInterval: 60_000,
  });
}

/** Logs a Cetaris Part Sale number against a group of eBay sales. */
export function useLogCetaris() {
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.show);
  return useMutation({
    mutationFn: (v: { lineItemIds: string[]; number: string }) => logCetarisSale(v.lineItemIds, v.number),
    onSuccess: (result, v) => {
      void qc.invalidateQueries({ queryKey: SALES_QUERY_KEY });
      toast(`Part Sale ${v.number} logged against ${result.logged} ${result.logged === 1 ? 'sale' : 'sales'}`);
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not log the Part Sale', 'error'),
  });
}

export function useClearCetaris() {
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.show);
  return useMutation({
    mutationFn: (lineItemId: string) => clearCetarisSale(lineItemId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: SALES_QUERY_KEY }),
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not take the number back', 'error'),
  });
}

/**
 * Brings eBay up to date when the app opens, if nobody has in the last half hour. Quiet
 * unless something new arrived: a sale is worth a word, a refreshed view count is not.
 */
export function useSyncOnOpen(enabled: boolean) {
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.show);
  useEffect(() => {
    if (!enabled) return;
    syncSalesIfStale()
      .then((r) => {
        if (!r.synced) return;
        void qc.invalidateQueries({ queryKey: SALES_QUERY_KEY });
        void qc.invalidateQueries({ queryKey: ['listings'] });
        if (r.added) toast(`${r.added} new ${r.added === 1 ? 'sale' : 'sales'} from eBay`);
      })
      // A failed background sync is not worth interrupting anyone for; the button is there.
      .catch(() => undefined);
  }, [enabled, qc, toast]);
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
          ? `; ${result.listings} listings refreshed` +
            (result.linked > 0 ? `, ${result.linked} newly linked` : '')
          : '';
      toast(`Synced ${result.fetched} sales — ${parts.join(', ')}${listings}`);
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Sales sync failed', 'error'),
  });
}
