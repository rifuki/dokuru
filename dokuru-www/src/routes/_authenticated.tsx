import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { AuthProvider } from "@/providers/AuthProvider";
import { WebSocketProvider } from "@/providers/WebSocketProvider";
import { useIsAuthenticated, useAuthUser } from "@/stores/use-auth-store";
import { useEffect, useState } from "react";
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

// Mock notifications
const adminNotifications = [
  { id: 1, title: "New user registered", description: "john@example.com joined", time: "2 min ago", unread: true },
  { id: 2, title: "API Key created", description: "Production key was created", time: "1 hour ago", unread: true },
  { id: 3, title: "System update", description: "Database backup completed", time: "3 hours ago", unread: false },
];

const userNotifications = [
  { id: 1, title: "System Update", description: "New features available", time: "1 hour ago", unread: true },
  { id: 2, title: "Announcement", description: "Scheduled maintenance on Sunday", time: "2 days ago", unread: false },
];

const WS_URL = import.meta.env.VITE_WS_URL || "wss://api.dokuru.rifuki.dev/ws";

export const Route = createFileRoute("/_authenticated")({
    component: AppLayout,
});

function AppLayout() {
    return (
        <AuthProvider>
            <RequireAuth>
                <WebSocketProvider url={WS_URL}>
                    <DashboardLayout />
                </WebSocketProvider>
            </RequireAuth>
        </AuthProvider>
    );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
    const isAuth = useIsAuthenticated();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const isPublicRoute = location.pathname === "/login" || location.pathname === "/register";

        if (!isAuth && !isPublicRoute) {
            navigate({ to: "/login", replace: true });
        }

        if (isAuth && isPublicRoute) {
            navigate({ to: "/", replace: true });
        }
    }, [isAuth, location.pathname, navigate]);

    return <>{children}</>;
}

function DashboardLayout() {
    const user = useAuthUser();
    const [commandOpen, setCommandOpen] = useState(false);
    const isAdmin = user?.role === "admin";
    
    // Get notifications based on role
    const notifications = isAdmin ? adminNotifications : userNotifications;
    const unreadCount = notifications.filter((n) => n.unread).length;

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
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

                        {/* Notifications - Available for all users */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="relative hover:bg-primary/10">
                                    <Bell className="h-5 w-5" />
                                    {unreadCount > 0 && (
                                        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                                    )}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-80">
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
                                    <div className="py-4 text-center text-sm text-muted-foreground">
                                        No notifications
                                    </div>
                                ) : (
                                    notifications.map((notification) => (
                                        <DropdownMenuItem
                                            key={notification.id}
                                            className="flex flex-col items-start gap-1 p-3 cursor-pointer focus:bg-primary/10 dark:focus:bg-primary/20 focus:text-primary"
                                        >
                                            <div className="flex w-full items-center justify-between">
                                                <span className="text-sm font-medium">{notification.title}</span>
                                                {notification.unread && (
                                                    <span className="h-2 w-2 rounded-full bg-primary" />
                                                )}
                                            </div>
                                            <span className="text-xs text-muted-foreground line-clamp-1">
                                                {notification.description}
                                            </span>
                                            <span className="text-xs text-muted-foreground">{notification.time}</span>
                                        </DropdownMenuItem>
                                    ))
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="justify-center text-sm text-muted-foreground cursor-pointer focus:bg-primary/10 dark:focus:bg-primary/20 focus:text-primary">
                                    View all notifications
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

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
