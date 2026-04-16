import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LoginForm } from "./LoginForm";
import { AuthHero } from "./AuthHero";
import { useIsAuthenticated, useAuthUser } from "@/stores/use-auth-store";

export function LoginPage() {
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();
  const user = useAuthUser();

  useEffect(() => {
    if (isAuthenticated) {
      navigate({ to: user?.role === "admin" ? "/admin" : "/", replace: true });
    }
  }, [isAuthenticated, user?.role, navigate]);

  if (isAuthenticated) return null;

  return (
    <div className="w-full h-screen lg:grid lg:grid-cols-2 overflow-hidden bg-background">
      <div className="flex flex-col justify-center items-center px-6 sm:px-8 lg:px-12 relative h-full">
        <div className="absolute top-4 right-4 z-10">
          <ThemeToggle />
        </div>
        <LoginForm />
      </div>
      <AuthHero />
    </div>
  );
}
