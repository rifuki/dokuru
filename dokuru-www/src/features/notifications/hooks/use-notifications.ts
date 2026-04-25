import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationService } from "@/lib/api";

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (params?: { limit?: number; offset?: number; unreadOnly?: boolean }) =>
    [...notificationKeys.all, "list", params ?? {}] as const,
  unreadCount: () => [...notificationKeys.all, "unread-count"] as const,
  summary: () => [...notificationKeys.all, "summary"] as const,
  preferences: () => [...notificationKeys.all, "preferences"] as const,
};

export function useNotifications(params?: {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => notificationService.list(params),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: notificationService.unreadCount,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });
}

export function useNotificationSummary() {
  return useQuery({
    queryKey: notificationKeys.summary(),
    queryFn: notificationService.summary,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationKeys.preferences(),
    queryFn: notificationService.preferences,
    staleTime: 60 * 1000,
  });
}

export function useSetNotificationPreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationService.setPreference,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useResetNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationService.resetPreferences,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationService.markRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationService.markAllRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
