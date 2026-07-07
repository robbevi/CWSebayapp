import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InventoryPart, InventoryPartPatch } from '@warehouse/shared';
import { savePart } from '../lib/api';
import { useToastStore } from '../state/useToastStore';
import { PARTS_QUERY_KEY } from './useInventoryParts';

export const useSavePart = () => {
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.show);

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: InventoryPartPatch }) => savePart(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: PARTS_QUERY_KEY });
      const previous = qc.getQueryData<InventoryPart[]>(PARTS_QUERY_KEY);
      qc.setQueryData<InventoryPart[]>(PARTS_QUERY_KEY, (old) =>
        (old ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p))
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) qc.setQueryData(PARTS_QUERY_KEY, context.previous);
      toast(err instanceof Error ? err.message : 'Failed to save part', 'error');
    },
    onSuccess: (updated) => {
      qc.setQueryData<InventoryPart[]>(PARTS_QUERY_KEY, (old) =>
        (old ?? []).map((p) => (p.id === updated.id ? updated : p))
      );
      toast(`Part ${updated.sku} saved`);
    },
  });
};
