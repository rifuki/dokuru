import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

interface EmailCheckResponse {
  available: boolean;
  email?: string;
  reason?: string;
}

export function useEmailAvailability(email: string) {
  const [debouncedEmail, setDebouncedEmail] = useState(email);

  // Debounce email input (1000ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedEmail(email);
    }, 1000);

    return () => clearTimeout(timer);
  }, [email]);

  return useQuery({
    queryKey: ["email-availability", debouncedEmail],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        data: EmailCheckResponse;
      }>("/auth/check-email", {
        params: { email: debouncedEmail },
      });
      return data.data;
    },
    enabled: debouncedEmail.length > 0 && debouncedEmail.includes("@"),
    staleTime: 30000,
    retry: false,
  });
}
