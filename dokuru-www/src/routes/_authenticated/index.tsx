import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthUser } from "@/stores/use-auth-store";
import { useEffect, useState } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { BreadcrumbNav } from "@/components/layout/BreadcrumbNav";
import { CommandMenu, CommandMenuTrigger } from "@/components/layout/CommandMenu";
import { HeaderUserMenu } from "@/components/layout/HeaderUserMenu";
import { Menu } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
    component: Dashboard,
});

function Dashboard() {
    const user = useAuthUser();
    const navigate = useNavigate();
    const [commandOpen, setCommandOpen] = useState(false);

    useEffect(() => {
        if (user?.role === "admin") {
            navigate({ to: "/admin", replace: true });
        }
    }, [user?.role, navigate]);

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
                {/* Top Header */}
                <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-background px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-16">
                    <div className="flex items-center gap-2">
                        <SidebarTrigger className="-ml-1 md:hidden">
                            <Menu className="h-5 w-5" />
                        </SidebarTrigger>
                        <BreadcrumbNav />
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Command Menu Trigger */}
                        <CommandMenuTrigger onClick={() => setCommandOpen(true)} />
                        <CommandMenu open={commandOpen} setOpen={setCommandOpen} />

                        {/* User Profile & Theme Menu */}
                        <HeaderUserMenu />
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 p-6">
                    <div className="max-w-7xl mx-auto w-full space-y-8">
                        <div>
                            <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                            <p className="text-muted-foreground mt-2 text-lg">
                                Welcome back, {user?.name || user?.username || 'User'}!
                            </p>
                        </div>

                        <div className="rounded-xl border border-dashed bg-card/50 p-12 text-center shadow-sm flex flex-col items-center justify-center min-h-[400px]">
                            <h3 className="text-xl font-semibold tracking-tight text-foreground/80">
                                Docker Security Dashboard
                            </h3>
                            <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                                Connect your Docker environments to start auditing.
                            </p>
                        </div>
                    </div>
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}
