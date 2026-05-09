"use client";

import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "@/lib/query-client";

const showTanStackDevtools = import.meta.env.DEV && import.meta.env.VITE_ENABLE_TANSTACK_DEVTOOLS === "true";

interface TanStackProviderProps {
  children: ReactNode;
}

export default function TanStackProvider({ children }: TanStackProviderProps) {
  const [localQueryClient] = useState(() => queryClient);

  return (
    <QueryClientProvider client={localQueryClient}>
      {children}
      {showTanStackDevtools && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
