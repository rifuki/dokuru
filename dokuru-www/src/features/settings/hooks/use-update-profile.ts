import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { userService } from "@/lib/api";
import { useAuthActions } from "@/stores/use-auth-store";
import { settingsKeys } from "./use-profile";

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { setUser } = useAuthActions();

  return useMutation({
    mutationFn: userService.updateMe,
    onSuccess: (user) => {
      setUser(user);
      queryClient.invalidateQueries({ queryKey: settingsKeys.profile() });
    },
    onError: (error: Error) => {
      toast.error("Update failed", {
        description: error.message,
      });
    },
  });
}
