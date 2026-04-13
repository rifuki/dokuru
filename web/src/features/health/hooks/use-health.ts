import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { getHealth } from '../api/get-health';
import type { HealthDetail } from '@/types/dokuru';

export function useHealth() {
  return useQuery<HealthDetail, Error>({
    queryKey: queryKeys.health.detail(),
    queryFn: getHealth,
    staleTime: 60 * 1000,
    retry: false,
  });
}
