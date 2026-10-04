import { useEffect, useState } from "react";

/**
 * Másodpercenként frissülő óra — a futó sorok eltelt idejéhez. A renderben
 * nem hívunk `Date.now()`-ot (az tisztátalan, és a lint is szól érte).
 */
export function useNow(enabled: boolean, everyMs = 1000): number {
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    // Az első érték is időzítőből jön: effekt törzsében nincs setState.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [enabled, everyMs]);

  return now;
}
