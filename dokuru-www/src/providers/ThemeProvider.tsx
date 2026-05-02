"use client";

import { useEffect, type ComponentProps } from "react";
import { ThemeProvider as NextThemeProvider } from "next-themes";

export default function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemeProvider>) {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.documentElement.classList.add("theme-ready");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return <NextThemeProvider {...props}>{children}</NextThemeProvider>;
}
