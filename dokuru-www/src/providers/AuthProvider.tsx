import { useEffect, useState } from "react";
import { useAuthActions } from "@/stores/use-auth-store";
import { authService } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface AuthProviderProps {
  children: React.ReactNode;
}

// Debug logging - only in development
const debug = import.meta.env.DEV ? console.log : () => { };

export function AuthProvider({ children }: AuthProviderProps) {
  const { login, logout, updateToken } = useAuthActions();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      debug("[AuthProvider] Starting auth check...");

      try {
        debug("[AuthProvider] Calling refreshToken...");
        const accessToken = await authService.refreshToken();

        if (cancelled) return;
        debug("[AuthProvider] refreshToken success");

        updateToken(accessToken);

        debug("[AuthProvider] Calling getMe...");
        const user = await authService.getMe();

        if (cancelled) return;
        debug("[AuthProvider] getMe success:", user.email);

        login(accessToken, user);
        debug("[AuthProvider] Login complete!");

      } catch (error: unknown) {
        if (!cancelled) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          // Keep error log for production debugging
          console.error("[AuthProvider] Auth failed:", errorMessage);
          logout();
        }
      } finally {
        if (!cancelled) {
          setIsChecking(false);
          debug("[AuthProvider] Auth check complete");
        }
      }
    };

    restoreSession();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-miku-primary" />
          <p className="text-sm text-muted-foreground">Authenticating...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
