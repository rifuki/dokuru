import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | number): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function getAvatarUrl(url?: string | null): string | undefined {
  if (!url) return undefined;

  let cacheT = "";
  try {
    if (typeof window !== "undefined") {
      cacheT = localStorage.getItem("avatar_update_ts") || "";
    }
  } catch {
    // ignore localStorage errors
  }

  const appendBuster = (u: string) => {
    if (!cacheT || u.includes("?t=") || u.includes("&t=")) return u;
    return `${u}${u.includes("?") ? "&" : "?"}t=${cacheT}`;
  };

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return appendBuster(url);
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedUrl = url.startsWith("/") ? url : `/${url}`;

  return appendBuster(`${normalizedBase}${normalizedUrl}`);
}
