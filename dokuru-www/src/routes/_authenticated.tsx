import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { AuthProvider } from "@/providers/AuthProvider";
import { useIsAuthenticated } from "@/stores/use-auth-store";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated")({
    component: AppLayout,
});

function AppLayout() {
    return (
        <AuthProvider>
            <RequireAuth>
                <Outlet />
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
