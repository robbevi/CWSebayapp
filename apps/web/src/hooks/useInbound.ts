import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchInbound,
  importInbound,
  packInbound,
  receiveInboundCrate,
  shipInboundCrate,
  unpackInbound,
  type ReceiveCrateInput,
} from '../lib/api';
import { useToastStore } from '../state/useToastStore';
import { PARTS_QUERY_KEY } from './useInventoryParts';

export const INBOUND_QUERY_KEY = ['inbound'];

/** Stock on its way to Williston. Polled gently: crates move over days, not minutes. */
export function useInbound(enabled = true) {
  return useQuery({ queryKey: INBOUND_QUERY_KEY, queryFn: fetchInbound, enabled, refetchInterval: 5 * 60_000, staleTime: 30_000 });
}

function useInboundMutation<V, R>(run: (v: V) => Promise<R>, done: (r: R, v: V) => string, failed: string, alsoParts = false) {
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.show);
  return useMutation({
    mutationFn: run,
    onSuccess: (r, v) => {
      void qc.invalidateQueries({ queryKey: INBOUND_QUERY_KEY });
      if (alsoParts) void qc.invalidateQueries({ queryKey: PARTS_QUERY_KEY });
      toast(done(r, v));
    },
    onError: (err) => toast(err instanceof Error ? err.message : failed, 'error'),
  });
}

const parts = (n: number) => `${n} ${n === 1 ? 'part' : 'parts'}`;

export const useImportInbound = () =>
  useInboundMutation(
    (v: { file: File; origin: string }) => importInbound(v.file, v.origin),
    (r, v) => `${v.origin}: ${r.added} added${r.skipped ? `, ${r.skipped} already here` : ''}`,
    'Could not import the file'
  );

export const usePackInbound = () =>
  useInboundMutation(
    (v: { crate: string; items: { id: string; qty?: number }[] }) => packInbound(v.crate, v.items),
    (r, v) => `${parts(r.packed)} packed into ${v.crate.toUpperCase()}`,
    'Could not pack those parts'
  );

export const useUnpackInbound = () =>
  useInboundMutation((ids: string[]) => unpackInbound(ids), (r) => `${parts(r.unpacked)} taken out`, 'Could not take that out');

export const useShipCrate = () =>
  useInboundMutation((crate: string) => shipInboundCrate(crate), (r, crate) => `${crate} shipped with ${parts(r.shipped)}`, 'Could not mark it shipped');

export const useReceiveCrate = () =>
  useInboundMutation(
    (v: ReceiveCrateInput) => receiveInboundCrate(v),
    (r, v) => `${v.crate} received: ${parts(r.parts)} added to Williston`,
    'Could not receive the crate',
    true
  );
