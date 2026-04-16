/**
 * Auth Hooks
 * Kombinasi Query + Mutations + Zustand
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authService } from "../services";
import { useAuthStore } from "@/stores/use-auth-store";

export const authKeys = {
  all: ["auth"] as const,
  me: () => [...authKeys.all, "me"] as const,
  session: () => [...authKeys.all, "session"] as const,
};

export function useMe(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: authService.getMe,
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

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

export function useLogin() {
  const queryClient = useQueryClient();
  const { login } = useAuthStore((state) => state.actions);

  return useMutation({
    mutationFn: authService.login,
    onSuccess: (data) => {
      login(data.token.access_token, data.user);
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
      toast.success("Welcome back!");
    },
    onError: (error: Error) => {
      toast.error("Login failed", {
        description: error.message,
      });
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  const { login } = useAuthStore((state) => state.actions);

  return useMutation({
    mutationFn: authService.register,
    onSuccess: (data) => {
      login(data.token.access_token, data.user);
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
      toast.success("Account created successfully!");
    },
    onError: (error: Error) => {
      toast.error("Registration failed", {
        description: error.message,
      });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const { logout } = useAuthStore((state) => state.actions);

  return useMutation({
    mutationFn: authService.logout,
    onSuccess: () => {
      logout();
      queryClient.clear();
      toast.success("Logged out successfully");
    },
    onError: () => {
      logout();
      queryClient.clear();
    },
  });
}

export {
  useAuthStore,
  useAuthUser,
  useAuthToken,
  useIsAuthenticated,
  useAuthLoading,
} from "@/stores/use-auth-store";
