import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthUser } from "@/stores/use-auth-store";

export const Route = createFileRoute("/_authenticated/agents/$id")({
    component: AgentLayout,
});

function AgentLayout() {
    const navigate = useNavigate();
    const user = useAuthUser();

    useEffect(() => {
        if (user?.role === "admin") {
            void navigate({ to: "/admin", replace: true });
        }
    }, [user?.role, navigate]);

    if (user?.role === "admin") return null;

    return <Outlet />;
}
