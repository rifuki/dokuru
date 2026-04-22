import { useQuery } from "@tanstack/react-query";
import { adminService } from "@/lib/api";
import type { DashboardStats } from "../types/stats";

export const adminKeys = {
  all: ["admin"] as const,
};

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: [...adminKeys.all, "stats"],
    queryFn: adminService.getDashboardStats,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });
}
