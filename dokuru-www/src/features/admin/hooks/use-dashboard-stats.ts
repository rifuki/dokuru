import { useQuery } from "@tanstack/react-query";
import { adminService } from "@/lib/api";

export const adminKeys = {
  all: ["admin"] as const,
};

export function useDashboardStats() {
  return useQuery({
    queryKey: [...adminKeys.all, "stats"],
    queryFn: adminService.getDashboardStats,
    staleTime: 30 * 1000,
  });
}
