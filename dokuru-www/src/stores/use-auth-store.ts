/**
 * Auth Store
 * Zustand store for authentication state management
 * 
 * SECURITY NOTE: Access token is stored in MEMORY only (not localStorage).
 * This prevents XSS attacks from stealing the token.
 * Refresh token is handled via httpOnly cookie (backend-managed).
 */

import { create } from "zustand";
import type { User } from "@/features/auth/types";

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

export const useAuthUser = () => useAuthStore((state) => state.user);
export const useAuthToken = () => useAuthStore((state) => state.accessToken);
export const useIsAuthenticated = () =>
  useAuthStore((state) => state.isAuthenticated);
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);
