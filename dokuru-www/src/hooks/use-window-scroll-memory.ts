import { useEffect, useLayoutEffect, useRef } from "react";
import { getSidebarNavigationIntentForPath } from "@/lib/sidebar-navigation";

const RESTORE_DELAYS = [0, 32, 100, 250, 500, 900, 1400];

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

function scrollWindowTo(scrollY: number) {
  window.scrollTo({ top: scrollY, left: 0, behavior: "instant" });
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
  const shouldPersistRef = useRef(true);
  const allowPersistRef = useRef(true);
  const lastObservedScrollYRef = useRef(0);
  const restoreGuardUntilRef = useRef(0);
  const completedRestoreTokenRef = useRef<string | null>(null);
  const isRestoring = false;

  useEffect(() => {
    lastObservedScrollYRef.current = readSavedWindowScrollY(key) || window.scrollY;
  }, [key]);

  useEffect(() => {
    if (!restoreIntent.fromSidebar) return;

    const allowManualPersist = () => {
      if (completedRestoreTokenRef.current === restoreIntent.token) allowPersistRef.current = true;
    };

    window.addEventListener("wheel", allowManualPersist, { passive: true });
    window.addEventListener("touchmove", allowManualPersist, { passive: true });
    window.addEventListener("keydown", allowManualPersist);

    return () => {
      window.removeEventListener("wheel", allowManualPersist);
      window.removeEventListener("touchmove", allowManualPersist);
      window.removeEventListener("keydown", allowManualPersist);
    };
  }, [restoreIntent.fromSidebar, restoreIntent.token]);

  useEffect(() => {
    let frameId: number | null = null;

    const persistScroll = (scrollY: number) => {
      if (!shouldPersistRef.current || !allowPersistRef.current) return;
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

      persistScroll(lastObservedScrollYRef.current);
    };
  }, [key]);

  useLayoutEffect(() => {
    const intent = windowScrollRestoreIntent(key);
    shouldPersistRef.current = true;
    allowPersistRef.current = !intent.fromSidebar || intent.savedScrollY <= 0;

    if (!intent.fromSidebar) {
      if (window.scrollY !== 0) scrollWindowTo(0);
      lastObservedScrollYRef.current = 0;
      writeSavedWindowScrollY(key, 0);
      return;
    }

    if (!canRestore) {
      allowPersistRef.current = !intent.fromSidebar;
      return;
    }
    if (intent.savedScrollY <= 0) {
      const frameId = window.requestAnimationFrame(() => {
        completedRestoreTokenRef.current = intent.token;
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    allowPersistRef.current = false;

    restoreGuardUntilRef.current = Date.now() + 1_200;

    let cancelled = false;
    const frameIds: number[] = [];
    const timeoutIds: ReturnType<typeof window.setTimeout>[] = [];
    let completed = false;

    const finishRestore = (targetReached: boolean) => {
      if (cancelled || completed) return;
      completed = true;
      allowPersistRef.current = targetReached;
      completedRestoreTokenRef.current = intent.token;
      lastObservedScrollYRef.current = window.scrollY;
    };

    const restore = (finalAttempt = false) => {
      if (cancelled || completed) return;
      const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const nextScrollY = Math.min(intent.savedScrollY, maxScrollY);
      const targetReached = maxScrollY >= intent.savedScrollY;
      if (nextScrollY !== window.scrollY) scrollWindowTo(nextScrollY);
      if (targetReached || finalAttempt) finishRestore(targetReached);
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
      if (!completed) allowPersistRef.current = false;
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
