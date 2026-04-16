import { apiClient, API_ENDPOINTS } from "@/lib/api";
import type { ApiResponse } from "@/lib/api/types";
import type { UserWithTimestamps } from "@/features/admin/types/admin-types";

export interface LogLevelRequest {
  level: "trace" | "debug" | "info" | "warn" | "error";
}

export interface DashboardStats {
  total_users: number;
  total_admins: number;
  total_api_keys: number;
  active_api_keys: number;
  new_users_this_month: number;
}

export interface ApiKey {
  id: string;
  name: string;
  key?: string;
  scopes: string[];
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
  created_by: string;
}

export interface CreateApiKeyRequest {
  name: string;
  scopes: string[];
  expires_days?: number;
}

export interface CreateApiKeyResponse {
  id: string;
  name: string;
  key: string;
  scopes: string[];
  created_at: string;
  expires_at: string | null;
}

export const adminService = {
  getUsers: async (): Promise<UserWithTimestamps[]> => {
    const response = await apiClient.get<ApiResponse<UserWithTimestamps[]>>(
      API_ENDPOINTS.ADMIN.USERS
    );

    const data = response.data.data;
    if (!data) {
      throw new Error("Failed to get users");
    }

    return data;
  },

  setLogLevel: async (level: LogLevelRequest["level"]): Promise<void> => {
    await apiClient.post<ApiResponse<void>>(API_ENDPOINTS.ADMIN.LOG_LEVEL, {
      level,
    });
  },

  getDashboardStats: async (): Promise<DashboardStats> => {
    const response = await apiClient.get<ApiResponse<DashboardStats>>(
      API_ENDPOINTS.ADMIN.STATS
    );

    const data = response.data.data;
    if (!data) {
      throw new Error("Failed to get dashboard stats");
    }

    return data;
  },

  updateUserRole: async (
    userId: string,
    role: "admin" | "user"
  ): Promise<void> => {
    await apiClient.post<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.USER_ROLE(userId),
      { role }
    );
  },

  getApiKeys: async (): Promise<ApiKey[]> => {
    const response = await apiClient.get<ApiResponse<ApiKey[]>>(
      API_ENDPOINTS.ADMIN.API_KEYS
    );

    const data = response.data.data;
    if (!data) {
      throw new Error("Failed to get API keys");
    }

    return data;
  },

  createApiKey: async (
    name: string,
    scopes: string[],
    expiresDays?: number
  ): Promise<{ key: string }> => {
    const response = await apiClient.post<
      ApiResponse<{ key: string }>
    >(API_ENDPOINTS.ADMIN.API_KEYS, {
      name,
      scopes,
      expires_days: expiresDays,
    });

    const result = response.data.data;
    if (!result) {
      throw new Error("Failed to create API key");
    }

    return result;
  },

  revokeApiKey: async (id: string): Promise<void> => {
    await apiClient.post<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.API_KEY_REVOKE(id)
    );
  },

  deleteApiKey: async (id: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.ADMIN.API_KEY_DELETE(id)
    );
  },
};
