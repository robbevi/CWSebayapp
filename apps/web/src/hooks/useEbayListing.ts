import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentListing, PolicyChoice } from '@warehouse/shared';
import { checkListing, fetchSellerSetup, publishListing } from '../lib/api';
import { useToastStore } from '../state/useToastStore';
import { PARTS_QUERY_KEY } from './useInventoryParts';

interface ListingVars {
  partId: string;
  listing: AgentListing;
  policies: PolicyChoice;
  submittedBy?: string;
}

/** Business policies and ship-from. Only fetched once someone opens a listing. */
export function useSellerSetup(enabled: boolean) {
  return useQuery({
    queryKey: ['ebay-seller-setup'],
    queryFn: fetchSellerSetup,
    enabled,
    staleTime: 10 * 60_000,
  });
}

export function useCheckListing() {
  return useMutation({
    mutationFn: (v: ListingVars) => checkListing(v.partId, { listing: v.listing, policies: v.policies }),
  });
}

export function usePublishListing() {
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.show);

  return useMutation({
    mutationFn: (v: ListingVars) =>
      publishListing(v.partId, { listing: v.listing, policies: v.policies, submittedBy: v.submittedBy }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: PARTS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ['listings'] });
      if (result.recorded) toast(`Listed on eBay — item ${result.itemId}`);
      else toast(`Listed on eBay as item ${result.itemId}, but SPARE couldn't save it — ${result.note}`, 'error');
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Publishing failed', 'error'),
  });
}
