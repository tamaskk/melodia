/**
 * Egységes gombstílus: 3 változat, 2 méret. Osztálylánc, nem komponens —
 * így `<a>`, `<Link>` és `<button>` is ugyanúgy használhatja.
 *
 *   primary   — a képernyő fő művelete (egy van belőle egy helyen)
 *   secondary — minden más kattintható, kerettel
 *   ghost     — másodlagos, keret nélkül (pl. „Ürítés”)
 *
 *   sm = 32 px (táblázat, sávok, sűrű listák) · md = 36 px (űrlapok, fejléc)
 *
 * A beviteli mezők és legördülők ugyanezt a két magasságot használják.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg transition disabled:opacity-40";

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
};

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 font-medium text-white hover:bg-blue-500",
  secondary: "border border-[var(--border)] hover:border-blue-500",
  ghost: "text-[var(--muted)] hover:text-foreground",
};

export function button(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "sm",
): string {
  return `${BASE} ${SIZE[size]} ${VARIANT[variant]}`;
}

/** Beviteli mező / legördülő a gombokkal azonos magasságban. */
export function field(size: ButtonSize = "md"): string {
  return `${size === "sm" ? "h-8 text-xs" : "h-9 text-sm"} rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 outline-none focus:border-blue-500`;
}
