import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  Bell,
  CheckCheck,
  LockKeyhole,
  MailCheck,
  Server,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from "@/features/notifications/hooks/use-notifications";
import type { Notification } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

function notificationTone(kind: string) {
  if (kind.includes("password")) return "text-amber-400 bg-amber-500/10 border-amber-500/25";
  if (kind.includes("audit")) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/25";
  if (kind.includes("agent")) return "text-blue-400 bg-blue-500/10 border-blue-500/25";
  if (kind.includes("email")) return "text-cyan-400 bg-cyan-500/10 border-cyan-500/25";
  if (kind.includes("user")) return "text-violet-400 bg-violet-500/10 border-violet-500/25";
  return "text-muted-foreground bg-muted/40 border-border";
}

function NotificationIcon({ kind }: { kind: string }) {
  if (kind.includes("user_registered")) return <UserPlus className="h-5 w-5" />;
  if (kind.includes("email")) return <MailCheck className="h-5 w-5" />;
  if (kind.includes("password")) return <LockKeyhole className="h-5 w-5" />;
  if (kind.includes("agent")) return <Server className="h-5 w-5" />;
  if (kind.includes("audit")) return <ShieldCheck className="h-5 w-5" />;
  if (kind.includes("bootstrap")) return <Activity className="h-5 w-5" />;
  return <Bell className="h-5 w-5" />;
}

function NotificationsPage() {
  const navigate = useNavigate();
  const { data: notifications = [], isLoading } = useNotifications({ limit: 100 });
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const openNotification = (notification: Notification) => {
    if (!notification.read_at) {
      void markRead.mutateAsync(notification.id);
    }
    if (notification.target_path) {
      navigate({ to: notification.target_path });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread event${unreadCount === 1 ? "" : "s"}` : "All caught up"}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => markAllRead.mutate()}
          disabled={unreadCount === 0 || markAllRead.isPending}
        >
          <CheckCheck className="mr-2 h-4 w-4" />
          Mark all read
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 text-center">
            <Bell className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <h2 className="font-semibold">No notifications</h2>
              <p className="text-sm text-muted-foreground">
                Account, agent, and audit events will appear here.
              </p>
            </div>
          </div>
        ) : (
          notifications.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              onOpen={() => openNotification(notification)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: Notification;
  onOpen: () => void;
}) {
  const unread = !notification.read_at;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-start gap-4 border-b px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-muted/40",
        unread && "bg-primary/5"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
          notificationTone(notification.kind)
        )}
      >
        <NotificationIcon kind={notification.kind} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{notification.title}</span>
          {unread && (
            <Badge variant="secondary" className="bg-primary/15 text-primary border-primary/30">
              New
            </Badge>
          )}
        </span>
        <span className="mt-1 block text-sm text-muted-foreground">
          {notification.message}
        </span>
        <span className="mt-2 block text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </span>
      </span>
    </button>
  );
}
