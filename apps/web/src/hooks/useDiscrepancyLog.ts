import { useQuery } from '@tanstack/react-query';
import { fetchDiscrepancyLog } from '../lib/api';

export function useDiscrepancyLog() {
  return useQuery({
    queryKey: ['discrepancy-log'],
    queryFn: fetchDiscrepancyLog,
    refetchInterval: 60_000,
  });
}
