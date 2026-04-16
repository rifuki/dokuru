import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";
import { useLogin } from "@/features/auth/hooks/use-login";

export function LoginForm() {
  const [username, setUsername] = useState(
    import.meta.env.DEV ? "admin" : ""
  );
  const [password, setPassword] = useState(
    import.meta.env.DEV ? "9uBfq1iYZk6Uf*Ww" : ""
  );
  const [showPassword, setShowPassword] = useState(false);
  const login = useLogin();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login.mutateAsync({ username, password });
    } catch {
      // Error handled by hook
    }
  };

  return (
    <div className="w-full max-w-[400px]">
      <div className="flex items-center justify-center gap-2 mb-10">
        <img src="/favicon.svg" alt="Dokuru" className="w-10 h-10" />
        <span className="text-2xl font-bold tracking-tight">Dokuru</span>
      </div>

      <div className="space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">
            Enter your credentials to access your account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-medium">
              Username or Email
            </Label>
            <Input
              id="username"
              type="text"
              placeholder="username or email@example.com"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="h-11 transition-all focus-visible:ring-2 focus-visible:ring-miku-primary/50"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <a
                href="#"
                className="text-xs font-medium text-miku-primary hover:text-miku-accent transition-colors"
              >
                Forgot Password?
              </a>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 pr-10 transition-all focus-visible:ring-2 focus-visible:ring-miku-primary/50"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-11 bg-gradient-to-r from-miku-primary to-miku-accent hover:opacity-90 transition-opacity text-base font-medium shadow-md hover:shadow-lg"
            disabled={login.isPending}
          >
            {login.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Sign in <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground pt-2">
          Don&apos;t have an account?{" "}
          <Link
            to="/register"
            className="font-semibold text-miku-primary hover:text-miku-accent transition-colors hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-12 pb-4">
        By continuing, you agree to our{" "}
        <a
          href="#"
          className="underline underline-offset-4 hover:text-foreground transition-colors"
        >
          Terms of Service
        </a>{" "}
        and{" "}
        <a
          href="#"
          className="underline underline-offset-4 hover:text-foreground transition-colors"
        >
          Privacy Policy
        </a>
      </p>
    </div>
  );
}
