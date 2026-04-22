import { apiClient, API_ENDPOINTS } from "@/lib/api";
import type { ApiResponse } from "@/lib/api/types";
import type { UserWithTimestamps } from "@/features/admin/types/admin-types";
import type {
  AdminAgentListResponse,
  AdminAuditListResponse,
  DashboardStats,
} from "@/features/admin/types/stats";

export type { DashboardStats };

export interface LogLevelRequest {
  level: "trace" | "debug" | "info" | "warn" | "error";
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

export interface AdminLogsResponse {
  lines: string[];
  log_file: string | null;
  runtime_level: string;
}

export interface EffectiveConfigResponse {
  source: string;
  local_config_path: string;
  rust_env: string;
  is_production: boolean;
  field_sources: Record<string, string>;
  bootstrap: {
    enabled: boolean;
    admin_email: string;
    admin_username: string;
    admin_name: string;
  };
  server: {
    port: number;
    cors_allowed_origins: string[];
  };
  logging: {
    default_level: string;
  };
  cookie: {
    same_site: string;
    secure: boolean;
    http_only: boolean;
  };
  upload: {
    upload_dir: string;
    base_url: string;
    max_avatar_size_bytes: number;
  };
  email: {
    from_email: string;
    provider: string;
  };
  features: {
    redis_enabled: boolean;
    uploads_enabled: boolean;
    email_enabled: boolean;
  };
}

export interface LocalConfigResponse {
  path: string;
  content: string;
  exists: boolean;
}

export interface ReloadConfigResponse {
  message: string;
  effective_config: EffectiveConfigResponse;
  applied_immediately: string[];
  restart_required: string[];
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

  getLogs: async (): Promise<AdminLogsResponse> => {
    const response = await apiClient.get<ApiResponse<AdminLogsResponse>>(
      API_ENDPOINTS.ADMIN.LOGS
    );

    const data = response.data.data;
    if (!data) {
      throw new Error("Failed to get logs");
    }

    return data;
  },

  getEffectiveConfig: async (): Promise<EffectiveConfigResponse> => {
    const response = await apiClient.get<ApiResponse<EffectiveConfigResponse>>(
      API_ENDPOINTS.ADMIN.CONFIG
    );

    const data = response.data.data;
    if (!data) {
      throw new Error("Failed to get config");
    }

    return data;
  },

  getLocalConfig: async (): Promise<LocalConfigResponse> => {
    const response = await apiClient.get<ApiResponse<LocalConfigResponse>>(
      API_ENDPOINTS.ADMIN.CONFIG_LOCAL
    );

    const data = response.data.data;
    if (!data) {
      throw new Error("Failed to get local config");
    }

    return data;
  },

  saveLocalConfig: async (content: string): Promise<LocalConfigResponse> => {
    const response = await apiClient.put<ApiResponse<LocalConfigResponse>>(
      API_ENDPOINTS.ADMIN.CONFIG_LOCAL,
      { content }
    );

    const data = response.data.data;
    if (!data) {
      throw new Error("Failed to save local config");
    }

    return data;
  },

  reloadConfig: async (): Promise<ReloadConfigResponse> => {
    const response = await apiClient.post<ApiResponse<ReloadConfigResponse>>(
      API_ENDPOINTS.ADMIN.CONFIG_RELOAD
    );

    const data = response.data.data;
    if (!data) {
      throw new Error("Failed to reload config preview");
    }

    return data;
  },

  getAdminAgents: async (): Promise<AdminAgentListResponse> => {
    const response = await apiClient.get<ApiResponse<AdminAgentListResponse>>(
      API_ENDPOINTS.ADMIN.AGENTS
    );

    const data = response.data.data;
    if (!data) {
      throw new Error("Failed to get agents");
    }

    return data;
  },

  getAdminAudits: async (): Promise<AdminAuditListResponse> => {
    const response = await apiClient.get<ApiResponse<AdminAuditListResponse>>(
      API_ENDPOINTS.ADMIN.AUDITS
    );

    const data = response.data.data;
    if (!data) {
      throw new Error("Failed to get audits");
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

  updateUserStatus: async (userId: string, isActive: boolean): Promise<void> => {
    await apiClient.post<ApiResponse<void>>(API_ENDPOINTS.ADMIN.USER_STATUS(userId), {
      is_active: isActive,
    });
  },

  sendUserPasswordReset: async (userId: string): Promise<void> => {
    await apiClient.post<ApiResponse<void>>(API_ENDPOINTS.ADMIN.USER_RESET_PASSWORD(userId));
  },

  deleteUser: async (userId: string): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(API_ENDPOINTS.ADMIN.USER_DELETE(userId));
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
