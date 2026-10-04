import { useEffect, useRef } from "react";

/**
 * Jelzi a szülőnek, ha egy futás elindult vagy leállt — a műveleti sáv ebből
 * mutatja a "fut" pöttyöt akkor is, ha a panel össze van csukva.
 *
 * A szülő függvénye rendernként új lehet: refben tartjuk, és csak a tényleges
 * váltáskor hívjuk, különben önmagát hajtó ciklus lenne belőle.
 */
export function useReportActive(
  active: boolean,
  onChange?: (active: boolean) => void,
): void {
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  });
  useEffect(() => {
    callback.current?.(active);
  }, [active]);
}
