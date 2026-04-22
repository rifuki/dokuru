import { Fragment } from "react";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Home } from "lucide-react";

// Providers
import TanStackProvider from "@/providers/TanStackProvider";
import ThemeProvider from "@/providers/ThemeProvider";

// Components
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  return (
    <Fragment>
      <TanStackProvider>
        <ThemeProvider defaultTheme="system" enableSystem attribute="class">
          <Outlet />
          <Toaster position="bottom-right" richColors />
        </ThemeProvider>
      </TanStackProvider>
      <TanStackRouterDevtools />
    </Fragment>
  );
}

function NotFoundComponent() {
  const hasToken = typeof window !== "undefined" && localStorage.getItem("accessToken");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="space-y-2">
          <h1 className="text-9xl font-bold text-primary">404</h1>
          <h2 className="text-2xl font-semibold">Page Not Found</h2>
          <p className="text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        <Button asChild>
          <Link to={hasToken ? "/" : "/login"}>
            <Home className="mr-2 h-4 w-4" />
            {hasToken ? "Go Home" : "Login"}
          </Link>
        </Button>
      </div>
    </div>
  );
}
