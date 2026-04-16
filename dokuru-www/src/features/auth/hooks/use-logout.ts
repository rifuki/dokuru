import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authService } from "@/lib/api";
import { useAuthActions } from "@/stores/use-auth-store";

export function useLogout() {
  const queryClient = useQueryClient();
  const { logout } = useAuthActions();

  return useMutation({
    mutationFn: authService.logout,
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
