import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentListing, PolicyChoice } from '@warehouse/shared';
import {
  checkListing,
  fetchCategorySuggestions,
  fetchResearch,
  fetchSellerSetup,
  publishListing,
  requestResearch,
} from '../lib/api';
import { useToastStore } from '../state/useToastStore';
import { PARTS_QUERY_KEY } from './useInventoryParts';

interface ListingVars {
  partId: string;
  listing: AgentListing;
  policies: PolicyChoice;
  submittedBy?: string;
  /** ISO time to start the listing. Absent lists it now. */
  scheduleTime?: string;
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

/** Keyed on the agent's own title and path, so editing the title doesn't search on every keystroke. */
export function useCategorySuggestions(title: string, path: string, enabled: boolean) {
  return useQuery({
    queryKey: ['ebay-category-suggestions', title, path],
    queryFn: () => fetchCategorySuggestions(title, path),
    enabled: enabled && !!(title.trim() || path.trim()),
    staleTime: Infinity,
  });
}

/**
 * The newest Copilot research for a part. Polls while a request is outstanding, since the
 * agent takes a few minutes and nothing tells SPARE when it has finished.
 */
export function useResearch(partId: string, enabled: boolean, waiting: boolean) {
  return useQuery({
    queryKey: ['research', partId],
    queryFn: () => fetchResearch(partId),
    enabled,
    refetchInterval: waiting ? 20_000 : false,
  });
}

export function useRequestResearch() {
  const toast = useToastStore((s) => s.show);
  return useMutation({
    mutationFn: (partId: string) => requestResearch(partId),
    onError: (err) => toast(err instanceof Error ? err.message : 'Research request failed', 'error'),
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
      publishListing(v.partId, {
        listing: v.listing,
        policies: v.policies,
        submittedBy: v.submittedBy,
        scheduleTime: v.scheduleTime,
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: PARTS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ['listings'] });
      const what = result.scheduledFor
        ? `Scheduled on eBay for ${new Date(result.scheduledFor).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} — item ${result.itemId}`
        : `Listed on eBay — item ${result.itemId}`;
      if (result.recorded) toast(what);
      else toast(`${what}, but SPARE couldn't save it — ${result.note}`, 'error');
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Publishing failed', 'error'),
  });
}
