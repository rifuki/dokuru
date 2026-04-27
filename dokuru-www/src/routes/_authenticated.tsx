import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { WebSocketProvider } from "@/providers/WebSocketProvider";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import { useIsAuthenticated, useAuthLoading, useAuthUser } from "@/stores/use-auth-store";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { BreadcrumbNav } from "@/components/layout/BreadcrumbNav";
import { CommandMenu, CommandMenuTrigger } from "@/components/layout/CommandMenu";
import { HeaderUserMenu } from "@/components/layout/HeaderUserMenu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, Menu } from "lucide-react";
import {
    notificationKeys,
    useMarkNotificationRead,
    useNotifications,
    useUnreadNotificationCount,
} from "@/features/notifications/hooks/use-notifications";
import type { Notification } from "@/lib/api";

// Derive WebSocket URL from API base URL
const getWsUrl = () => {
  const apiUrl = import.meta.env.VITE_API_BASE_URL || "https://api.dokuru.rifuki.dev/api/v1";
  const baseUrl = apiUrl.replace(/\/api\/v1$/, "");
  const wsProtocol = baseUrl.startsWith("https") ? "wss" : "ws";
  return `${wsProtocol}://${baseUrl.replace(/^https?:\/\//, "")}/ws`;
};

const WS_URL = getWsUrl();

export const Route = createFileRoute("/_authenticated")({
    component: AppLayout,
});

function AppLayout() {
    return (
        <RequireAuth>
            <WebSocketProvider url={WS_URL}>
                <DashboardLayout />
            </WebSocketProvider>
        </RequireAuth>
    );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
    const isAuth = useIsAuthenticated();
    const isLoading = useAuthLoading();
    const user = useAuthUser();
    const location = useLocation();
    const navigate = useNavigate();
    const isAdmin = user?.role === "admin";
    const isAdminRoute = location.pathname === "/admin" || location.pathname.startsWith("/admin/");

    useEffect(() => {
        if (isLoading) return;
        if (!isAuth) {
            navigate({ to: "/login", replace: true });
            return;
        }
        if (isAdmin && !isAdminRoute) {
            navigate({ to: "/admin", replace: true });
        }
    }, [isAdmin, isAdminRoute, isAuth, isLoading, navigate]);

    if (isLoading || !isAuth || (isAdmin && !isAdminRoute)) return null;

    return <>{children}</>;
}

function DashboardLayout() {
    const [commandOpen, setCommandOpen] = useState(false);

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="min-w-0 overflow-x-hidden">
                {/* Top Header - Shared for all authenticated users */}
                <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-background px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-16">
                    <div className="flex items-center gap-2">
                        <SidebarTrigger className="-ml-1 md:hidden">
                            <Menu className="h-5 w-5" />
                        </SidebarTrigger>
                        <BreadcrumbNav />
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Command Menu - Available for all */}
                        <CommandMenuTrigger onClick={() => setCommandOpen(true)} />
                        <CommandMenu open={commandOpen} setOpen={setCommandOpen} />

                        <NotificationsMenu />

                        {/* User Menu - Available for all */}
                        <HeaderUserMenu />
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 p-6 min-w-0 overflow-x-hidden">
                    <Outlet />
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}

function NotificationsMenu() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { lastMessage } = useWebSocketContext();
    const { data: notifications = [] } = useNotifications({ limit: 5 });
    const { data: unreadCount = 0 } = useUnreadNotificationCount();
    const markRead = useMarkNotificationRead();

    useEffect(() => {
        if (!lastMessage?.data) return;
        try {
            const event = JSON.parse(lastMessage.data as string) as { type?: string };
            if (event.type === "notifications:updated") {
                void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
            }
        } catch {
            // Ignore non-JSON websocket messages.
        }
    }, [lastMessage, queryClient]);

    const openNotification = (notification: Notification) => {
        if (!notification.read_at) {
            void markRead.mutateAsync(notification.id);
        }
        if (notification.target_path) {
            navigate({ to: notification.target_path });
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative hover:bg-primary/10">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-96">
                <DropdownMenuLabel className="flex items-center justify-between">
                    <span>Notifications</span>
                    {unreadCount > 0 && (
                        <Badge variant="secondary" className="text-xs bg-primary/15 text-primary border-primary/30">
                            {unreadCount} new
                        </Badge>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                        No notifications
                    </div>
                ) : (
                    notifications.map((notification) => (
                        <DropdownMenuItem
                            key={notification.id}
                            onSelect={() => openNotification(notification)}
                            className="flex flex-col items-start gap-1 p-3 cursor-pointer focus:bg-primary/10 dark:focus:bg-primary/20"
                        >
                            <div className="flex w-full items-center justify-between gap-3">
                                <span className="text-sm font-medium">{notification.title}</span>
                                {!notification.read_at && (
                                    <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                                )}
                            </div>
                            <span className="text-xs text-muted-foreground line-clamp-2">
                                {notification.message}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                            </span>
                        </DropdownMenuItem>
                    ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    className="justify-center text-sm text-muted-foreground cursor-pointer focus:bg-primary/10 dark:focus:bg-primary/20 focus:text-primary"
                    onSelect={() => navigate({ to: "/notifications" })}
                >
                    View all notifications
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
