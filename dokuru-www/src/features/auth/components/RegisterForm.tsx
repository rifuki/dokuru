import { useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useRegister } from "@/features/auth/hooks/use-register";
import { useUsernameAvailability } from "@/features/auth/hooks/use-username-availability";

export function RegisterForm() {
  const [username, setUsername] = useState(
    import.meta.env.DEV ? "testuser" : ""
  );
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(
    import.meta.env.DEV ? "test@example.com" : ""
  );
  const [password, setPassword] = useState(
    import.meta.env.DEV ? "password123" : ""
  );
  const [confirmPassword, setConfirmPassword] = useState(
    import.meta.env.DEV ? "password123" : ""
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimerRef = useRef<number | null>(null);
  const register = useRegister();

  // Live username availability check with debounce
  const usernameCheck = useUsernameAvailability(username);

  // Track typing state for spinner
  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow lowercase letters, numbers, and underscores (no spaces!)
    const filtered = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(filtered);
    
    // Auto-fill fullName from username (replace _ with space and capitalize)
    if (!fullName) {
      setFullName(filtered.replace(/[._-]/g, ' '));
    }
    
    // Clear previous timer
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    
    if (filtered.length >= 3) {
      setIsTyping(true);
      // Reset after debounce time
      typingTimerRef.current = setTimeout(() => {
        setIsTyping(false);
      }, 1000);
    } else {
      setIsTyping(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Don't submit if username is taken
    if (usernameCheck.data && !usernameCheck.data.available) {
      return;
    }

    try {
      await register.mutateAsync({ username, email, password, fullName });
    } catch {
      // Error handled by hook
    }
  };

  const showUsernameStatus =
    username.length >= 3 && !usernameCheck.isLoading && usernameCheck.data;

  return (
    <div className="w-full max-w-100">
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
            <Label htmlFor="username" className="text-sm font-medium">
              Username
            </Label>
            <div className="relative">
              <Input
                id="username"
                type="text"
                placeholder="johndoe"
                value={username}
                onChange={handleUsernameChange}
                required
                minLength={3}
                maxLength={30}
                pattern="[a-z0-9_]+"
                title="Username can only contain lowercase letters, numbers, and underscores"
                className="h-11 pr-10 transition-all focus-visible:ring-2 focus-visible:ring-miku-primary/50"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {/* Show X if < 3 chars */}
                {username.length > 0 && username.length < 3 && (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                {/* Show loading spinner while typing or checking */}
                {(isTyping || usernameCheck.isLoading) && username.length >= 3 && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {/* Show checkmark if available */}
                {!isTyping && showUsernameStatus && usernameCheck.data.available && (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
                {/* Show X if taken */}
                {!isTyping && showUsernameStatus && !usernameCheck.data.available && (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
            </div>
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
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {password.length > 0 && password.length < 8 && (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                {password.length >= 8 && (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors"
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="text-sm font-medium">
              Confirm Password
            </Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="h-11 pr-10 transition-all focus-visible:ring-2 focus-visible:ring-miku-primary/50"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {confirmPassword.length > 0 && confirmPassword !== password && (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                {confirmPassword.length > 0 && confirmPassword === password && password.length >= 8 && (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            {confirmPassword.length > 0 && confirmPassword !== password && (
              <p className="text-xs text-red-500">Passwords do not match</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-11 bg-gradient-to-r from-miku-primary to-miku-accent hover:opacity-90 transition-opacity text-base font-medium shadow-md hover:shadow-lg"
            disabled={
              register.isPending ||
              password.length < 8 ||
              confirmPassword !== password ||
              (usernameCheck.data && !usernameCheck.data.available)
            }
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
