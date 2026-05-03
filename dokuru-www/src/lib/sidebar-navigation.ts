const SIDEBAR_NAVIGATION_KEY = "dokuru_sidebar_navigation";
const SIDEBAR_NAVIGATION_MAX_AGE_MS = 15_000;

export type SidebarNavigationIntent = {
  pathname: string;
  createdAt: number;
};

function normalizePathname(pathname: string) {
  const normalized = pathname.split(/[?#]/, 1)[0] || "/";
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;
}

function readSidebarNavigationIntent(): SidebarNavigationIntent | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(SIDEBAR_NAVIGATION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SidebarNavigationIntent>;
    if (typeof parsed.pathname !== "string" || typeof parsed.createdAt !== "number") return null;
    if (Date.now() - parsed.createdAt > SIDEBAR_NAVIGATION_MAX_AGE_MS) {
      window.sessionStorage.removeItem(SIDEBAR_NAVIGATION_KEY);
      return null;
    }

    return {
      pathname: normalizePathname(parsed.pathname),
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

export function markSidebarNavigation(pathname: string) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(SIDEBAR_NAVIGATION_KEY, JSON.stringify({
      pathname: normalizePathname(pathname),
      createdAt: Date.now(),
    } satisfies SidebarNavigationIntent));
  } catch {
    // Navigation source is a UI hint only; ignore storage failures.
  }
}

export function getSidebarNavigationIntentForPath(pathname = typeof window === "undefined" ? "/" : window.location.pathname) {
  const intent = readSidebarNavigationIntent();
  if (!intent) return null;
  return intent.pathname === normalizePathname(pathname) ? intent : null;
}

export function isSidebarNavigationForPath(pathname?: string) {
  return !!getSidebarNavigationIntentForPath(pathname);
}
