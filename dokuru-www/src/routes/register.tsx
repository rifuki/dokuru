import { createFileRoute, redirect } from "@tanstack/react-router";
import { RegisterPage } from "@/features/auth/components/RegisterPage";
import { useAuthStore } from "@/stores/use-auth-store";

export const Route = createFileRoute("/register")({
  beforeLoad: () => {
    const { isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated) {
      throw redirect({ to: "/" });
    }
  },
  component: RegisterPage,
});
