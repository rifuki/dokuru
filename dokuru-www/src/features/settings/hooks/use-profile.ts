import { useQuery } from "@tanstack/react-query";
import { userService } from "@/lib/api";
import { useIsAuthenticated, useAuthStore } from "@/stores/use-auth-store";

export const settingsKeys = {
  all: ["settings"] as const,
  profile: () => [...settingsKeys.all, "profile"] as const,
};

export function useProfile(options?: { enabled?: boolean }) {
  const isAuth = useIsAuthenticated();

  return useQuery({
    queryKey: settingsKeys.profile(),
    queryFn: async () => {
      const user = await userService.getMe();
      // Keep auth store in sync with latest server state
      useAuthStore.getState().actions.setUser(user);
      return user;
    },
    enabled: isAuth && (options?.enabled ?? true),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}
