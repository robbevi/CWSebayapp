import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InventoryPart } from '@warehouse/shared';
import { uploadPhoto } from '../lib/api';
import { PARTS_QUERY_KEY } from './useInventoryParts';

export const useUploadPhoto = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      sku,
      itemId,
      file,
      submittedBy,
    }: {
      sku: string;
      itemId: string;
      file: File;
      submittedBy?: string;
    }) => uploadPhoto(sku, itemId, file, submittedBy),
    onSuccess: (photo, { itemId }) => {
      qc.setQueryData<InventoryPart[]>(PARTS_QUERY_KEY, (old) =>
        (old ?? []).map((p) => (p.id === itemId ? { ...p, photos: [...p.photos, photo], photographed: true } : p))
      );
      // A photo can complete a part, which logs a submission server-side — refresh the
      // scoreboard/goals counts so they reflect it without waiting for the poll interval.
      qc.invalidateQueries({ queryKey: ['submissions-summary'] });
      qc.invalidateQueries({ queryKey: ['submissions-all'] });
    },
  });
};
