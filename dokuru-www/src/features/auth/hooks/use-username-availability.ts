import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

interface UsernameCheckResponse {
  available: boolean;
  username?: string;
  reason?: string;
}

export function useUsernameAvailability(username: string) {
  const [debouncedUsername, setDebouncedUsername] = useState(username);

  // Debounce username input (1000ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedUsername(username);
    }, 1000);

    return () => clearTimeout(timer);
  }, [username]);

  return useQuery({
    queryKey: ["username-availability", debouncedUsername],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        data: UsernameCheckResponse;
      }>("/auth/check-username", {
        params: { username: debouncedUsername },
      });
      return data.data;
    },
    enabled: debouncedUsername.length >= 3, // Only check if >= 3 chars
    staleTime: 30000, // Cache for 30s
    retry: false,
  });
}
