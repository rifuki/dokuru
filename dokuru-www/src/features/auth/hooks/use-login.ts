import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authService } from "@/lib/api";
import { useAuthActions } from "@/stores/use-auth-store";
import { isApiError } from "@/lib/api/types";

export const authKeys = {
  all: ["auth"] as const,
  me: () => [...authKeys.all, "me"] as const,
};

export function useLogin() {
  const queryClient = useQueryClient();
  const { login } = useAuthActions();

  return useMutation({
    mutationFn: authService.login,
    onSuccess: (data) => {
      login(data.token.access_token, data.user);
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
      toast.success("Welcome back!");
    },
    onError: (error: unknown) => {
      let description = "An unexpected error occurred.";
      if (isApiError(error)) {
        description = error.message;
      } else if (error instanceof Error) {
        description = error.message;
      }

      toast.error("Login failed", {
        description,
      });
    },
  });
}
