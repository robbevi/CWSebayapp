import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../lib/api';

export const useHealth = () =>
  useQuery({ queryKey: ['health'], queryFn: fetchHealth, staleTime: 60_000 });
