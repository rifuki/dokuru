import { useEffect, useRef } from "react";

const RESTORE_DELAYS = [0, 32, 100, 250, 500, 900];

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

export function useWindowScrollMemory(key: string, canRestore = true) {
  const lastObservedScrollYRef = useRef(0);
  const restoreGuardUntilRef = useRef(0);

  useEffect(() => {
    lastObservedScrollYRef.current = readSavedWindowScrollY(key) || window.scrollY;
  }, [key]);

  useEffect(() => {
    let frameId: number | null = null;

    const persistScroll = (scrollY: number) => writeSavedWindowScrollY(key, scrollY);
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

  useEffect(() => {
    if (!canRestore) return;
    const savedScrollY = readSavedWindowScrollY(key);
    if (savedScrollY <= 0) return;
    restoreGuardUntilRef.current = Date.now() + 1_200;

    let cancelled = false;
    const frameIds: number[] = [];
    const timeoutIds: ReturnType<typeof window.setTimeout>[] = [];

    const restore = () => {
      if (cancelled) return;
      const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maxScrollY <= 0) return;
      window.scrollTo({ top: Math.min(savedScrollY, maxScrollY), left: 0 });
    };

    for (const delay of RESTORE_DELAYS) {
      const timeoutId = window.setTimeout(() => {
        const frameId = window.requestAnimationFrame(() => {
          restore();
          const secondFrameId = window.requestAnimationFrame(restore);
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
}
