import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useIsAuthenticated } from "@/stores/use-auth-store";
import { useEffect } from "react";
import { SettingsLayout } from "@/features/settings/components/SettingsLayout";

export const Route = createFileRoute("/settings")({
    component: SettingsRoot,
});

function SettingsRoot() {
    const isAuth = useIsAuthenticated();
    const navigate = useNavigate();

    useEffect(() => {
        if (!isAuth) {
            navigate({ to: "/login", replace: true });
        }
    }, [isAuth, navigate]);

    if (!isAuth) {
        return null;
    }

    return <SettingsLayout />;
}
