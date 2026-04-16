import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { authService } from "@/lib/api";

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      authService.changePassword(data.currentPassword, data.newPassword),
    onSuccess: () => {
      toast.success("Password changed successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to change password", {
        description: error.message,
      });
    },
  });
}
