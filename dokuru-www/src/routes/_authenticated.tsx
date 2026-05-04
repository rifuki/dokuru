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
import { cn } from "@/lib/utils";
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
import { IS_LOCAL_AGENT_MODE } from "@/lib/env";

// Derive WebSocket URL from API base URL
const getWsUrl = () => {
  const apiUrl = import.meta.env.VITE_API_BASE_URL || "https://api.dokuru.rifuki.dev/api/v1";
  const baseUrl = apiUrl.replace(/\/api\/v1$/, "");
  const wsProtocol = baseUrl.startsWith("https") ? "wss" : "ws";
  return `${wsProtocol}://${baseUrl.replace(/^https?:\/\//, "")}/ws`;
};

const WS_URL = getWsUrl();
const HEADER_REVEAL_OFFSET = 72;
const HEADER_SCROLL_DELTA = 8;

function useRevealHeaderOnScroll() {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        let lastScrollY = window.scrollY;
        let ticking = false;
        let animationFrameId: number | null = null;

        const updateVisibility = () => {
            const currentScrollY = Math.max(0, window.scrollY);
            const delta = currentScrollY - lastScrollY;

            if (currentScrollY <= HEADER_REVEAL_OFFSET) {
                setVisible(true);
                lastScrollY = currentScrollY;
                ticking = false;
                return;
            }

            if (Math.abs(delta) >= HEADER_SCROLL_DELTA) {
                setVisible(delta < 0);
                lastScrollY = currentScrollY;
            }

            ticking = false;
        };

        const handleScroll = () => {
            if (ticking) return;
            ticking = true;
            animationFrameId = window.requestAnimationFrame(updateVisibility);
        };

        window.addEventListener("scroll", handleScroll, { passive: true });

        return () => {
            window.removeEventListener("scroll", handleScroll);
            if (animationFrameId !== null) {
                window.cancelAnimationFrame(animationFrameId);
            }
        };
    }, []);

    return visible;
}

export const Route = createFileRoute("/_authenticated")({
    component: AppLayout,
});

function AppLayout() {
    return (
        <RequireAuth>
            <WebSocketProvider url={WS_URL} enabled={!IS_LOCAL_AGENT_MODE}>
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
    const isSettingsRoute = location.pathname === "/settings" || location.pathname.startsWith("/settings/");

    useEffect(() => {
        if (isLoading) return;
        if (!isAuth) {
            navigate({ to: "/login", replace: true });
            return;
        }
        if (isAdmin && !isAdminRoute && !isSettingsRoute) {
            navigate({ to: "/admin", replace: true });
        }
    }, [isAdmin, isAdminRoute, isAuth, isLoading, isSettingsRoute, navigate]);

    if (isLoading || !isAuth || (isAdmin && !isAdminRoute && !isSettingsRoute)) return null;

    return <>{children}</>;
}

function DashboardLayout() {
    const [commandOpen, setCommandOpen] = useState(false);
    const headerVisible = useRevealHeaderOnScroll();

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="min-w-0 overflow-x-clip bg-transparent">
                {/* Top Header - Shared for all authenticated users */}
                <header
                    className={cn(
                        "sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background/80 px-3 backdrop-blur-xl transition-[transform,opacity,width,height] duration-200 ease-out motion-reduce:transition-none sm:px-4 group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-16",
                        headerVisible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0"
                    )}
                >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <SidebarTrigger className="-ml-1 md:hidden">
                            <Menu className="h-5 w-5" />
                        </SidebarTrigger>
                        <BreadcrumbNav />
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
                        {/* Command Menu - Available for all */}
                        <CommandMenuTrigger onClick={() => setCommandOpen(true)} />
                        <CommandMenu open={commandOpen} setOpen={setCommandOpen} />

                        {!IS_LOCAL_AGENT_MODE && <NotificationsMenu />}

                        {/* User Menu - Available for all */}
                        <HeaderUserMenu />
                    </div>
                </header>

                {/* Page Content */}
                <main className="relative flex-1 min-w-0 overflow-x-clip p-4 sm:p-6 md:p-8">
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
            <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-[14px] p-1 shadow-xl">
                <DropdownMenuLabel className="flex items-center justify-between px-3 py-2.5">
                    <span>Notifications</span>
                    {unreadCount > 0 && (
                        <Badge variant="secondary" className="text-xs bg-primary/15 text-primary border-primary/30">
                            {unreadCount} new
                        </Badge>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="-mx-1 my-1" />
                {notifications.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                        No notifications
                    </div>
                ) : (
                    notifications.map((notification) => (
                        <DropdownMenuItem
                            key={notification.id}
                            onSelect={() => openNotification(notification)}
                            className="flex cursor-pointer flex-col items-start gap-1 rounded-[8px] p-2.5 focus:bg-primary/10 dark:focus:bg-primary/20"
                        >
                            <div className="flex w-full items-center justify-between gap-3">
                                <span className="truncate text-sm font-medium">{notification.title}</span>
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
                <DropdownMenuSeparator className="-mx-1 my-1" />
                <DropdownMenuItem
                    className="cursor-pointer justify-center rounded-[8px] py-2.5 text-sm text-muted-foreground focus:bg-primary/10 focus:text-primary dark:focus:bg-primary/20"
                    onSelect={() => navigate({ to: "/notifications" })}
                >
                    View all notifications
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
