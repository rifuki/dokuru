import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { getAudit } from '../api/get-audit';
import type { AuditReport } from '@/types/dokuru';

export function useAudit(enabled: boolean = true) {
  return useQuery<AuditReport, Error>({
    queryKey: queryKeys.audit.report(),
    queryFn: getAudit,
    enabled,
    staleTime: 5 * 60 * 1000, // Audit is heavy, cache for 5 minutes unless refetched
  });
}
