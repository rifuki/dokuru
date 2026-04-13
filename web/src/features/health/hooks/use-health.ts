import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { getHealth, type HealthStatus } from '../api/get-health';

export function useHealth() {
  return useQuery<HealthStatus, Error>({
    queryKey: queryKeys.health.detail(),
    queryFn: getHealth,
    staleTime: 60 * 1000,
    retry: false,
  });
}
