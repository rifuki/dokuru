import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { getAudit } from '../api/get-audit';
import { useEnvironmentStore } from '@/stores/environment-store';
import type { AuditReport } from '@/types/dokuru';

export function useAudit(enabled: boolean = true) {
  const activeId = useEnvironmentStore((s) => s.activeEnvironmentId);

  return useQuery<AuditReport, Error>({
    queryKey: queryKeys.audit.report(),
    queryFn: getAudit,
    enabled: enabled && !!activeId,
    staleTime: 5 * 60 * 1000,
  });
}
