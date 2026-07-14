import { useQuery } from '@tanstack/react-query';
import { fetchSubmissionSummary } from '../lib/api';

export const SUBMISSIONS_QUERY_KEY = ['submissions-summary'];

export function useSubmissionSummary() {
  return useQuery({
    queryKey: SUBMISSIONS_QUERY_KEY,
    queryFn: fetchSubmissionSummary,
    refetchInterval: 60_000,
  });
}
