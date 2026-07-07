import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InventoryPart } from '@warehouse/shared';
import { uploadPhoto } from '../lib/api';
import { PARTS_QUERY_KEY } from './useInventoryParts';

export const useUploadPhoto = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ sku, itemId, file }: { sku: string; itemId: string; file: File }) =>
      uploadPhoto(sku, itemId, file),
    onSuccess: (photo, { itemId }) => {
      qc.setQueryData<InventoryPart[]>(PARTS_QUERY_KEY, (old) =>
        (old ?? []).map((p) => (p.id === itemId ? { ...p, photos: [...p.photos, photo], photographed: true } : p))
      );
    },
  });
};
