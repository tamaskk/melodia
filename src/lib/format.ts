/**
 * Számok egységes kiírása: `3 126`, `133 322`.
 *
 * A magyar nyelvi szabály (CLDR) a négyjegyű számokat szándékosan nem tagolja,
 * ezért a `toLocaleString("hu")` egyszer `3126`-ot, máskor `133 322`-t ad. Egy
 * felületen ez következetlen — itt mindig tagolunk.
 */
const NUMBER = new Intl.NumberFormat("hu-HU", { useGrouping: "always" });

export function formatNumber(value: number): string {
  return NUMBER.format(value);
}
