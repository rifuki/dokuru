import { Outlet, useNavigate } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useAuthUser } from "@/stores/use-auth-store";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const user = useAuthUser();

  useEffect(() => {
    if (user && user.role !== "admin") {
      navigate({ to: "/", replace: true });
    }
  }, [navigate, user]);

  if (!user || user.role !== "admin") {
    return null;
  }

  return <Outlet />;
}
