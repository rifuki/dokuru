import { useMutation, useQueryClient } from '@tanstack/react-query';
import { applyFix } from '../api/apply-fix';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';

export function useApplyFix() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ruleId: string) => applyFix(ruleId),
    onSuccess: (outcome) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all });

      if (outcome.status === 'applied') {
        toast.success('Remediation applied', {
          description: outcome.requires_restart && outcome.restart_command
            ? `${outcome.message} Next: ${outcome.restart_command}`
            : outcome.message,
        });
        return;
      }

      if (outcome.status === 'blocked') {
        toast.error('Remediation blocked', {
          description: outcome.message,
        });
        return;
      }

      toast.message('Guided remediation required', {
        description: outcome.message,
      });
    },
    onError: (error: Error) => {
      toast.error('Remediation request failed', {
        description: error.message,
      });
    },
  });
}
