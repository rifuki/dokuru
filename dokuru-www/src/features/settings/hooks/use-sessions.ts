import { useQuery } from "@tanstack/react-query";
import { authService } from "@/lib/api";

export const settingsKeys = {
  all: ["settings"] as const,
  sessions: () => [...settingsKeys.all, "sessions"] as const,
};

export interface Session {
  id: string;
  device: string;
  location: string;
  ip: string;
  current: boolean;
  createdAt: string;
}

export function useSessions() {
  return useQuery({
    queryKey: settingsKeys.sessions(),
    queryFn: authService.getSessions,
    staleTime: 60 * 1000,
  });
}
