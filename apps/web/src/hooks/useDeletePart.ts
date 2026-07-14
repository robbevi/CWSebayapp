import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InventoryPart } from '@warehouse/shared';
import { deletePart } from '../lib/api';
import { useToastStore } from '../state/useToastStore';
import { PARTS_QUERY_KEY } from './useInventoryParts';

export const useDeletePart = () => {
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.show);

  return useMutation({
    mutationFn: ({ id }: { id: string; sku: string }) => deletePart(id),
    onSuccess: (_data, { id, sku }) => {
      qc.setQueryData<InventoryPart[]>(PARTS_QUERY_KEY, (old) => (old ?? []).filter((p) => p.id !== id));
      toast(`Part ${sku} deleted`);
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : 'Failed to delete part', 'error');
    },
  });
};
