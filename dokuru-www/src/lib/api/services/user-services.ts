import { apiClient, API_ENDPOINTS } from "@/lib/api";
import type { ApiResponse } from "@/lib/api/types";
import type { User } from "@/features/auth/types/auth-types";

export interface UpdateUserData {
  name?: string;
  username?: string;
  email?: string;
}

export const userService = {
  getMe: async (): Promise<User> => {
    const response = await apiClient.get<ApiResponse<User>>(
      API_ENDPOINTS.USER.ME
    );

    const data = response.data.data;
    if (!data) {
      throw new Error("Failed to get user profile");
    }

    return data;
  },

  updateMe: async (userData: UpdateUserData): Promise<User> => {
    const response = await apiClient.patch<ApiResponse<User>>(
      API_ENDPOINTS.USER.UPDATE,
      userData
    );

    const data = response.data.data;
    if (!data) {
      throw new Error("Failed to update user profile");
    }

    return data;
  },
};
