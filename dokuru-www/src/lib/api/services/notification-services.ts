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

  markRead: async (id: string): Promise<Notification> => {
    const response = await apiClient.post(API_ENDPOINTS.NOTIFICATIONS.MARK_READ(id));
    return response.data.data;
  },

  markAllRead: async (): Promise<number> => {
    const response = await apiClient.post(API_ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ);
    return response.data.data.updated;
  },
};
