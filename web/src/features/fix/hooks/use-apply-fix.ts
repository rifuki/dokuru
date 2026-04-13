import { useMutation, useQueryClient } from '@tanstack/react-query';
import { applyFix } from '../api/apply-fix';
import { queryKeys } from '@/lib/query-keys';

export function useApplyFix() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ruleId: string) => applyFix(ruleId),
    onSuccess: () => {
      // Invalidate the audit report so next time the user checks, it fetches fresh data showing the fix.
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all });
    },
  });
}
