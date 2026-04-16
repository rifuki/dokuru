import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminService } from "@/lib/api";

export const adminKeys = {
  all: ["admin"] as const,
  apiKeys: () => [...adminKeys.all, "api-keys"] as const,
};

export function useDeleteApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminService.deleteApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.apiKeys() });
    },
  });
}
