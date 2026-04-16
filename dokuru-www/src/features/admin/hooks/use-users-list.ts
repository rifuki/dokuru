import { useQuery } from "@tanstack/react-query";
import { adminService } from "@/lib/api";

export const adminKeys = {
  all: ["admin"] as const,
  users: () => [...adminKeys.all, "users"] as const,
};

export function useUsersList(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.users(),
    queryFn: adminService.getUsers,
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}
