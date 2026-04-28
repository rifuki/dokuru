import { useQuery } from "@tanstack/react-query";
import { authService } from "@/lib/api";

export const settingsKeys = {
  all: ["settings"] as const,
  sessions: () => [...settingsKeys.all, "sessions"] as const,
};

export interface Session {
  id: string;
  device: string;
  device_type?: string | null;
  location: string;
  ip: string;
  created_at: string;
  last_active_at: string;
  is_current: boolean;
}

export function useSessions() {
  return useQuery({
    queryKey: settingsKeys.sessions(),
    queryFn: authService.getSessions,
    staleTime: 60 * 1000,
  });
}
