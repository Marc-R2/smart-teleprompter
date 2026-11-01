import { useEffect } from "react";

// Keeps the screen on while `active`. The browser releases the lock whenever
// the tab is hidden, so it is requested again on return. Without browser
// support, or when refused (e.g. low battery), the app simply works as before.
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !navigator.wakeLock) return undefined;
    let lock = null;
    let cancelled = false;

    const request = async () => {
      if (cancelled || lock || document.visibilityState !== "visible") return;
      try {
        const acquired = await navigator.wakeLock.request("screen");
        if (cancelled) {
          acquired.release().catch(() => {});
          return;
        }
        lock = acquired;
        lock.addEventListener("release", () => {
          lock = null;
        });
      } catch (_) {}
    };

    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", request);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
