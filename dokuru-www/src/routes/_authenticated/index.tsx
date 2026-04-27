import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthUser } from "@/stores/use-auth-store";

export const Route = createFileRoute("/_authenticated/")({
    component: RootRedirect,
});

function RootRedirect() {
    const navigate = useNavigate();
    const user = useAuthUser();

    useEffect(() => {
        void navigate({
            to: user?.role === "admin" ? "/admin" : "/agents",
            replace: true,
        });
    }, [user?.role, navigate]);

    return null;
}
