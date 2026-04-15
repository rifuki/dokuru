import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { getHealth } from '../api/get-health';
import { useEnvironmentStore } from '@/stores/environment-store';
import type { HealthDetail } from '@/types/dokuru';

export function useHealth() {
  const activeId = useEnvironmentStore((s) => s.activeEnvironmentId);

  return useQuery<HealthDetail, Error>({
    queryKey: queryKeys.health.detail(),
    queryFn: getHealth,
    enabled: !!activeId,
    staleTime: 60 * 1000,
    retry: false,
  });
}
