import { useQuery } from '@tanstack/react-query';
import { fetchAllSubmissions } from '../lib/api';

export function useAllSubmissions() {
  return useQuery({
    queryKey: ['submissions-all'],
    queryFn: fetchAllSubmissions,
    refetchInterval: 60_000,
  });
}
