import { useQuery } from '@tanstack/react-query';
import { fetchParts } from '../lib/api';

export const PARTS_QUERY_KEY = ['parts'];

export const useInventoryParts = () =>
  useQuery({ queryKey: PARTS_QUERY_KEY, queryFn: fetchParts, staleTime: 30_000 });
