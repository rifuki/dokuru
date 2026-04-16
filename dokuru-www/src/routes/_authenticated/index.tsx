import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthUser } from "@/stores/use-auth-store";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/")({
    component: Dashboard,
});

function Dashboard() {
    const user = useAuthUser();
    const navigate = useNavigate();

    useEffect(() => {
        if (user?.role === "admin") {
            navigate({ to: "/admin", replace: true });
        }
    }, [user?.role, navigate]);

    return (
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
    );
}
