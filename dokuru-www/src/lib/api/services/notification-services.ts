import { apiClient, API_ENDPOINTS } from "@/lib/api";

export interface Notification {
  id: string;
  kind: string;
  title: string;
  message: string;
  target_path?: string | null;
  metadata: Record<string, unknown>;
  read_at?: string | null;
  created_at: string;
}

export interface NotificationListParams {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}

export interface NotificationKindSummary {
  kind: string;
  total: number;
  unread: number;
  latest_at?: string | null;
  known: boolean;
  audience?: "user" | "admin" | null;
  severity?: "info" | "success" | "warning" | null;
  target_hint?: string | null;
}

export interface NotificationSummary {
  total: number;
  unread: number;
  kinds: NotificationKindSummary[];
}

export interface NotificationPreference {
  kind: string;
  enabled: boolean;
  configurable: boolean;
  audience: "user" | "admin";
  severity: "info" | "success" | "warning";
  target_hint: string;
}

export const notificationService = {
  list: async (params: NotificationListParams = {}): Promise<Notification[]> => {
    const response = await apiClient.get(API_ENDPOINTS.NOTIFICATIONS.LIST, {
      params: {
        limit: params.limit,
        offset: params.offset,
        unread_only: params.unreadOnly,
      },
    });
    return response.data.data;
  },

  unreadCount: async (): Promise<number> => {
    const response = await apiClient.get(API_ENDPOINTS.NOTIFICATIONS.UNREAD_COUNT);
    return response.data.data.count;
  },

  summary: async (): Promise<NotificationSummary> => {
    const response = await apiClient.get(API_ENDPOINTS.NOTIFICATIONS.SUMMARY);
    return response.data.data;
  },

  preferences: async (): Promise<NotificationPreference[]> => {
    const response = await apiClient.get(API_ENDPOINTS.NOTIFICATIONS.PREFERENCES);
    return response.data.data;
  },

  setPreference: async ({
    kind,
    enabled,
  }: {
    kind: string;
    enabled: boolean;
  }): Promise<NotificationPreference> => {
    const response = await apiClient.put(API_ENDPOINTS.NOTIFICATIONS.PREFERENCE(kind), {
      enabled,
    });
    return response.data.data;
  },

  resetPreferences: async (): Promise<number> => {
    const response = await apiClient.post(API_ENDPOINTS.NOTIFICATIONS.RESET_PREFERENCES);
    return response.data.data.deleted;
  },

  markRead: async (id: string): Promise<Notification> => {
    const response = await apiClient.post(API_ENDPOINTS.NOTIFICATIONS.MARK_READ(id));
    return response.data.data;
  },

  markAllRead: async (): Promise<number> => {
    const response = await apiClient.post(API_ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ);
    return response.data.data.updated;
  },
};
