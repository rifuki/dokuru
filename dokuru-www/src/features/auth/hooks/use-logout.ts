import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authService } from "@/lib/api";
import { useAuthActions } from "@/stores/use-auth-store";
import { IS_LOCAL_AGENT_MODE } from "@/lib/env";

export function useLogout() {
  const queryClient = useQueryClient();
  const { logout } = useAuthActions();

  return useMutation({
    mutationFn: () => IS_LOCAL_AGENT_MODE ? Promise.resolve() : authService.logout(),
    onSuccess: () => {
      logout();
      queryClient.clear();
      toast.success("Logged out successfully");
    },
    onError: () => {
      logout();
      queryClient.clear();
    },
  });
}
