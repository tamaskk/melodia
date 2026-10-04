import { useEffect } from "react";

/**
 * Szerveroldali futás állapotának figyelése, kímélő ritmusban.
 *
 * Nyugalmi állapotban nem pollolunk: egy lekérdezés induláskor, és egy-egy
 * akkor, amikor a lap újra előtérbe kerül (tabváltás, ablakfókusz) — így egy
 * másik tabban vagy szerverinduláskor indult futást is észrevesszük. Csak futás
 * közben kérdezünk rá rendszeresen, és akkor is csak látható lapon.
 */
export function useStatusPoll(
  refresh: () => Promise<void>,
  active: boolean,
  activeMs: number,
): void {
  useEffect(() => {
    let last = 0;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      // Tabváltáskor a focus és a visibilitychange együtt jön: egy kérés elég.
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      void refresh();
    };

    // Az első lekérdezés is időzítőből indul: effekt törzsében nincs setState.
    const first = setTimeout(tick, 0);
    const timer = active ? setInterval(tick, activeMs) : null;
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);

    return () => {
      clearTimeout(first);
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [active, activeMs, refresh]);
}
