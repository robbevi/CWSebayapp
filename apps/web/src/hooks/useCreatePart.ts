import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreatePartInput, InventoryPart } from '@warehouse/shared';
import { createPart } from '../lib/api';
import { useToastStore } from '../state/useToastStore';
import { PARTS_QUERY_KEY } from './useInventoryParts';

export const useCreatePart = () => {
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.show);

  return useMutation({
    mutationFn: (input: CreatePartInput) => createPart(input),
    onSuccess: (created) => {
      qc.setQueryData<InventoryPart[]>(PARTS_QUERY_KEY, (old) => [...(old ?? []), created]);
      toast(`Part ${created.sku} added`);
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : 'Failed to add part', 'error');
    },
  });
};
