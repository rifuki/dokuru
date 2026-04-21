import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export function useEmailChange() {
  return useMutation({
    mutationFn: async (newEmail: string) => {
      const response = await apiClient.post('/users/change-email', { new_email: newEmail });
      return response.data;
    },
  });
}
