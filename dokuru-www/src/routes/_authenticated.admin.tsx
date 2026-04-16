import { Outlet, useNavigate } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useAuthUser } from "@/stores/use-auth-store";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const user = useAuthUser();

  // Redirect standard users to their dashboard
  if (user?.role !== "admin") {
    navigate({ to: "/" });
    return null;
  }

  return <Outlet />;
}
