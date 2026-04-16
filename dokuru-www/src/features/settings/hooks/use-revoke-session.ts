import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authService } from "@/lib/api";
import { settingsKeys } from "./use-sessions";

export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => authService.revokeSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.sessions() });
      toast.success("Session revoked");
    },
    onError: (error: Error) => {
      toast.error("Failed to revoke session", {
        description: error.message,
      });
    },
  });
}
