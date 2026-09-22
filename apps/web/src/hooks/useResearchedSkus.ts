import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchResearchedSkus } from '../lib/api';
import { useSalesStatus } from './useSales';

/**
 * Which SKUs Copilot has already written up. One listing serves the whole board, so the
 * Researched badge and filter cost a single request rather than one per card.
 */
export function useResearchedSkus(): Set<string> {
  const { data: status } = useSalesStatus();
  const { data } = useQuery({
    queryKey: ['researched-skus'],
    queryFn: fetchResearchedSkus,
    enabled: !!status?.research,
    staleTime: 60_000,
  });
  return useMemo(() => new Set(data ?? []), [data]);
}

export const isResearched = (skus: Set<string>, sku: string) => skus.has(sku.trim().toLowerCase());
