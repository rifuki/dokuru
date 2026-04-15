import { useQuery } from '@tanstack/react-query';
import { useEnvironmentStore } from '@/stores/environment-store';
import { getEnvInfo } from '../api/get-env-info';

export function useEnvInfo() {
  const environments = useEnvironmentStore((s) => s.environments);
  const activeId = useEnvironmentStore((s) => s.activeEnvironmentId);
  const activeEnv = environments.find((e) => e.id === activeId);

  return useQuery({
    queryKey: ['env-info', activeEnv?.url],
    queryFn: () => getEnvInfo(activeEnv!.url),
    enabled: !!activeEnv,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
