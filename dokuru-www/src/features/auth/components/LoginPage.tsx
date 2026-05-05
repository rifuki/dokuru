import { useEffect } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LoginForm } from "./LoginForm";
import { AuthHero } from "./AuthHero";
import { useIsAuthenticated, useAuthUser } from "@/stores/use-auth-store";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

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
      <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-6 sm:px-8 lg:px-12">
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <ThemeToggle />
        </div>
        <div className="relative z-10 w-full flex justify-center">
          <LoginForm />
        </div>
      </div>
      <AuthHero />
    </div>
  );
}
