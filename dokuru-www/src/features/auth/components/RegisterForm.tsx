import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";
import { useRegister } from "@/features/auth/hooks/use-register";

export function RegisterForm() {
  const [name, setName] = useState(import.meta.env.DEV ? "Test User" : "");
  const [username, setUsername] = useState(
    import.meta.env.DEV ? "testuser" : ""
  );
  const [email, setEmail] = useState(
    import.meta.env.DEV ? "test@example.com" : ""
  );
  const [password, setPassword] = useState(
    import.meta.env.DEV ? "password123" : ""
  );
  const [showPassword, setShowPassword] = useState(false);
  const register = useRegister();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register.mutateAsync({ name, username, email, password });
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
          <h1 className="text-2xl font-bold tracking-tight">Create account</h1>
          <p className="text-sm text-muted-foreground">Start your journey</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              Full name
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-11 transition-all focus-visible:ring-2 focus-visible:ring-miku-primary/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-medium">
              Username{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="username"
              type="text"
              placeholder="johndoe"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-11 transition-all focus-visible:ring-2 focus-visible:ring-miku-primary/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 transition-all focus-visible:ring-2 focus-visible:ring-miku-primary/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Min 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
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
            disabled={register.isPending}
          >
            {register.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Create account <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground pt-2">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-semibold text-miku-primary hover:text-miku-accent transition-colors hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-12 pb-4">
        By signing up, you agree to our{" "}
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
