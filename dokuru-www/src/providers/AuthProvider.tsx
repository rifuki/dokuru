/**
 * Auth Provider
 * Handles session restoration on app load
 */

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/use-auth-store";
import { useEnvironmentStore } from "@/stores/environment-store";
import { authService } from "@/features/auth";
import { Loader2 } from "lucide-react";

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { login, logout, updateToken } = useAuthStore((state) => state.actions);
  const fetchEnvironments = useEnvironmentStore((state) => state.fetchEnvironments);
  const clearEnvironments = useEnvironmentStore((state) => state.clearEnvironments);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const accessToken = await authService.refreshToken();
        if (cancelled) return;

        updateToken(accessToken);
        const user = await authService.getMe();
        if (cancelled) return;

        login(accessToken, user);
        
        // Fetch user's environments
        await fetchEnvironments();
      } catch {
        if (!cancelled) {
          logout();
          clearEnvironments();
        }
      } finally {
        if (!cancelled) {
          setIsChecking(false);
        }
      }
    };

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, [login, logout, updateToken, fetchEnvironments, clearEnvironments]);

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Authenticating...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
