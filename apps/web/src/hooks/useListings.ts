import { useQuery } from '@tanstack/react-query';
import { fetchListings } from '../lib/api';

export function useListings() {
  return useQuery({
    queryKey: ['listings'],
    queryFn: fetchListings,
    refetchInterval: 5 * 60_000,
  });
}
