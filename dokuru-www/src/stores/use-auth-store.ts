import { create } from "zustand";
import type { User } from "@/features/auth/types/auth-types";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  actions: {
    login: (accessToken: string, user: User) => void;
    logout: () => void;
    setUser: (user: User | null) => void;
    setLoading: (isLoading: boolean) => void;
    updateToken: (token: string) => void;
  };
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,
  actions: {
    login: (accessToken, user) => {
      set({
        user,
        accessToken,
        isAuthenticated: true,
        isLoading: false,
      });
    },
    logout: () => {
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
      });
    },
    setUser: (user) => {
      set({ user, isAuthenticated: !!user });
    },
    setLoading: (isLoading) => {
      set({ isLoading });
    },
    updateToken: (token) => {
      set({ accessToken: token });
    },
  },
}));

export const useAuthActions = () => useAuthStore((state) => state.actions);
export const useAuthUser = () => useAuthStore((state) => state.user);
export const useAuthToken = () => useAuthStore((state) => state.accessToken);
export const useIsAuthenticated = () =>
  useAuthStore((state) => state.isAuthenticated);
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);

export const useAuthState = () =>
  useAuthStore((state) => ({
    user: state.user,
    accessToken: state.accessToken,
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
  }));
