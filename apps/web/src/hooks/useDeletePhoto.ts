import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InventoryPart } from '@warehouse/shared';
import { deletePhoto } from '../lib/api';
import { useToastStore } from '../state/useToastStore';
import { PARTS_QUERY_KEY } from './useInventoryParts';

export const useDeletePhoto = () => {
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.show);

  return useMutation({
    mutationFn: ({ fileId, sku, itemId }: { fileId: string; sku: string; itemId: string }) =>
      deletePhoto(fileId, sku, itemId),
    onSuccess: (_data, { fileId, itemId }) => {
      qc.setQueryData<InventoryPart[]>(PARTS_QUERY_KEY, (old) =>
        (old ?? []).map((p) => {
          if (p.id !== itemId) return p;
          const photos = p.photos.filter((photo) => photo.fileId !== fileId);
          return { ...p, photos, photographed: photos.length > 0 };
        })
      );
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : 'Failed to remove photo', 'error');
    },
  });
};
