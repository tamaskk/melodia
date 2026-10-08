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

/** Fájlméret emberi alakban: `120 KB`, `1.4 MB`. */
export function fileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`;
}
