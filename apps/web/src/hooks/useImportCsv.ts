import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importCsv } from '../lib/api';
import { PARTS_QUERY_KEY } from './useInventoryParts';

export const useImportCsv = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => importCsv(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PARTS_QUERY_KEY });
    },
  });
};
