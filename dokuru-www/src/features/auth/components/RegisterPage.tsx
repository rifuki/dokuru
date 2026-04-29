import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RegisterForm } from "./RegisterForm";
import { AuthHero } from "./AuthHero";
import { useIsAuthenticated } from "@/stores/use-auth-store";

export function RegisterPage() {
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => {
    if (isAuthenticated) {
      navigate({ to: "/", replace: true });
    }
  }, [isAuthenticated, navigate]);

  if (isAuthenticated) return null;

  return (
    <div className="w-full h-screen lg:grid lg:grid-cols-2 overflow-hidden bg-background">
      <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-6 sm:px-8 lg:px-12">
        <div className="absolute top-4 right-4 z-10">
          <ThemeToggle />
        </div>
        <div className="relative z-10 w-full flex justify-center">
          <RegisterForm />
        </div>
      </div>
      <AuthHero />
    </div>
  );
}
