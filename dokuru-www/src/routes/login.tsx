import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginPage } from "@/features/auth/components/LoginPage";
import { useAuthStore } from "@/stores/use-auth-store";

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    const { isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});
