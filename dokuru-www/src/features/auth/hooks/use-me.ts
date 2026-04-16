import { useQuery } from "@tanstack/react-query";
import { authService } from "@/lib/api";
import { useIsAuthenticated } from "@/stores/use-auth-store";

export const authKeys = {
  all: ["auth"] as const,
  me: () => [...authKeys.all, "me"] as const,
};

export function useMe(options?: { enabled?: boolean }) {
  const isAuth = useIsAuthenticated();

  return useQuery({
    queryKey: authKeys.me(),
    queryFn: authService.getMe,
    enabled: isAuth && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
