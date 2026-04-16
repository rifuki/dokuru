import { useQuery } from "@tanstack/react-query";
import { adminService } from "@/lib/api";

export const adminKeys = {
  all: ["admin"] as const,
  apiKeys: () => [...adminKeys.all, "api-keys"] as const,
};

export function useApiKeys() {
  return useQuery({
    queryKey: adminKeys.apiKeys(),
    queryFn: adminService.getApiKeys,
    staleTime: 30 * 1000,
  });
}
