import { useQuery } from '@tanstack/react-query';
import { fetchAppUsers } from '../lib/api';

export function useAppUsers() {
  return useQuery({
    queryKey: ['app-users'],
    queryFn: fetchAppUsers,
    staleTime: Infinity,
  });
}
