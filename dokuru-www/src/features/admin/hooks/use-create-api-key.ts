import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminService } from "@/lib/api";

export const adminKeys = {
  all: ["admin"] as const,
  apiKeys: () => [...adminKeys.all, "api-keys"] as const,
};

export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      name,
      scopes,
      expiresDays,
    }: {
      name: string;
      scopes: string[];
      expiresDays?: number;
    }) => adminService.createApiKey(name, scopes, expiresDays),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.apiKeys() });
    },
  });
}
