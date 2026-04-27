import { createFileRoute, redirect } from "@tanstack/react-router";
import { RegisterPage } from "@/features/auth/components/RegisterPage";
import { useAuthStore } from "@/stores/use-auth-store";

export const Route = createFileRoute("/register")({
  beforeLoad: () => {
    const { isAuthenticated, user } = useAuthStore.getState();
    if (isAuthenticated) {
      throw redirect({ to: user?.role === "admin" ? "/admin" : "/" });
    }
  },
  component: RegisterPage,
});
