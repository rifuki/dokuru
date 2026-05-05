import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createRouter, RouterProvider } from "@tanstack/react-router";

import "./index.css";
import { RoutePendingFallback } from "@/components/layout/RoutePendingFallback";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Create a new router instance
const router = createRouter({
  routeTree,
  scrollRestoration: ({ location }) => !location.pathname.startsWith("/agents/"),
  defaultPendingComponent: RoutePendingFallback,
  defaultPendingMs: 120,
  defaultPendingMinMs: 250,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Render the app
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Element with id 'root' not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
