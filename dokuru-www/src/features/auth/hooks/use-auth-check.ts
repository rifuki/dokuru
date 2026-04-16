import { useQuery } from "@tanstack/react-query";
import { authService } from "@/lib/api";

export const authKeys = {
  all: ["auth"] as const,
  session: () => [...authKeys.all, "session"] as const,
};

export function useAuthCheck(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: authKeys.session(),
    queryFn: async () => {
      try {
        const user = await authService.getMe();
        return { isAuthenticated: true, user } as const;
      } catch {
        return { isAuthenticated: false, user: null } as const;
      }
    },
    enabled: options?.enabled ?? true,
    staleTime: Infinity,
    retry: false,
  });
}
