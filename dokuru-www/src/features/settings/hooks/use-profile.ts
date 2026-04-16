import { useQuery } from "@tanstack/react-query";
import { userService } from "@/lib/api";
import { useIsAuthenticated } from "@/stores/use-auth-store";

export const settingsKeys = {
  all: ["settings"] as const,
  profile: () => [...settingsKeys.all, "profile"] as const,
};

export function useProfile(options?: { enabled?: boolean }) {
  const isAuth = useIsAuthenticated();

  return useQuery({
    queryKey: settingsKeys.profile(),
    queryFn: userService.getMe,
    enabled: isAuth && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
  });
}
