import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getSidebarNavigationIntentForPath } from "@/lib/sidebar-navigation";

const RESTORE_DELAYS = [0, 32, 100, 250, 500, 900];

type ScrollRestoreIntent = {
  token: string;
  fromSidebar: boolean;
  savedScrollY: number;
};

function readSavedWindowScrollY(key: string) {
  try {
    const value = Number(window.sessionStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeSavedWindowScrollY(key: string, scrollY: number) {
  try {
    window.sessionStorage.setItem(key, String(Math.max(0, Math.round(scrollY))));
  } catch {
    // Scroll memory is a convenience; ignore storage failures.
  }
}

function windowScrollRestoreIntent(key: string): ScrollRestoreIntent {
  const sidebarIntent = getSidebarNavigationIntentForPath();
  if (!sidebarIntent) {
    return {
      token: `${key}:normal`,
      fromSidebar: false,
      savedScrollY: 0,
    };
  }

  return {
    token: `${key}:${sidebarIntent.pathname}:${sidebarIntent.createdAt}`,
    fromSidebar: true,
    savedScrollY: readSavedWindowScrollY(key),
  };
}

export function useWindowScrollMemory(key: string, canRestore = true) {
  const restoreIntent = windowScrollRestoreIntent(key);
  const shouldPersistRef = useRef(restoreIntent.fromSidebar);
  const lastObservedScrollYRef = useRef(0);
  const restoreGuardUntilRef = useRef(0);
  const [completedRestoreToken, setCompletedRestoreToken] = useState<string | null>(null);
  const isRestoring = restoreIntent.fromSidebar && canRestore && restoreIntent.savedScrollY > 0 && completedRestoreToken !== restoreIntent.token;

  useEffect(() => {
    lastObservedScrollYRef.current = readSavedWindowScrollY(key) || window.scrollY;
  }, [key]);

  useEffect(() => {
    let frameId: number | null = null;
    const shouldPersist = shouldPersistRef.current;

    const persistScroll = (scrollY: number) => {
      if (!shouldPersist) return;
      writeSavedWindowScrollY(key, scrollY);
    };
    const saveLatestScroll = () => {
      frameId = null;
      const scrollY = window.scrollY;
      if (scrollY === 0 && lastObservedScrollYRef.current > 0 && Date.now() < restoreGuardUntilRef.current) return;
      lastObservedScrollYRef.current = scrollY;
      persistScroll(scrollY);
    };

    const handleScroll = () => {
      const scrollY = window.scrollY;
      if (!(scrollY === 0 && lastObservedScrollYRef.current > 0 && Date.now() < restoreGuardUntilRef.current)) {
        lastObservedScrollYRef.current = scrollY;
      }
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(saveLatestScroll);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pagehide", saveLatestScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pagehide", saveLatestScroll);
      if (frameId !== null) window.cancelAnimationFrame(frameId);

      const currentScrollY = window.scrollY;
      persistScroll(currentScrollY === 0 && lastObservedScrollYRef.current > 0 ? lastObservedScrollYRef.current : currentScrollY);
    };
  }, [key]);

  useLayoutEffect(() => {
    const intent = windowScrollRestoreIntent(key);
    shouldPersistRef.current = intent.fromSidebar;

    if (!intent.fromSidebar) {
      if (window.scrollY !== 0) window.scrollTo({ top: 0, left: 0 });
      return;
    }

    if (!canRestore) return;
    if (intent.savedScrollY <= 0) {
      const frameId = window.requestAnimationFrame(() => setCompletedRestoreToken(intent.token));
      return () => window.cancelAnimationFrame(frameId);
    }

    restoreGuardUntilRef.current = Date.now() + 1_200;

    let cancelled = false;
    const frameIds: number[] = [];
    const timeoutIds: ReturnType<typeof window.setTimeout>[] = [];
    let completed = false;

    const finishRestore = () => {
      if (cancelled || completed) return;
      completed = true;
      setCompletedRestoreToken(intent.token);
    };

    const restore = (finalAttempt = false) => {
      if (cancelled) return;
      const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const nextScrollY = Math.min(intent.savedScrollY, maxScrollY);
      if (nextScrollY !== window.scrollY) window.scrollTo({ top: nextScrollY, left: 0 });
      if (maxScrollY > 0 || finalAttempt) finishRestore();
    };

    for (const [index, delay] of RESTORE_DELAYS.entries()) {
      const finalAttempt = index === RESTORE_DELAYS.length - 1;
      const timeoutId = window.setTimeout(() => {
        const frameId = window.requestAnimationFrame(() => {
          restore(finalAttempt);
          const secondFrameId = window.requestAnimationFrame(() => restore(finalAttempt));
          frameIds.push(secondFrameId);
        });
        frameIds.push(frameId);
      }, delay);
      timeoutIds.push(timeoutId);
    }

    return () => {
      cancelled = true;
      for (const timeoutId of timeoutIds) window.clearTimeout(timeoutId);
      for (const frameId of frameIds) window.cancelAnimationFrame(frameId);
    };
  }, [canRestore, key]);

  return {
    isRestoring,
    restoreFromSidebar: restoreIntent.fromSidebar,
    savedScrollY: restoreIntent.savedScrollY,
  };
}
