/**
 * A levél nyelve a cég országához képest. Tiszta modul: a szerver és a
 * felület is ezzel dönti el, mit kell megjelölni.
 *
 * A küldő azt a levelet küldi, ami a soron áll — ha egy magyar cég során
 * angol szöveg van, angol levél megy. Ezt kiküldés előtt látni kell.
 */

/** Magyarázat, ha a nyelv nem illik az országhoz; különben `null`. */
export function languageMismatch(
  country: string | null | undefined,
  language: string | null | undefined,
): string | null {
  if (country === "HU" && language !== "hu") {
    return "magyar cég, a levél nem magyar";
  }
  if (country && country !== "HU" && language === "hu") {
    return "külföldi cég, a levél magyar";
  }
  return null;
}

/** Ugyanez adatbázis-szűrőként: a nem illő nyelvű sorok. */
export const LANGUAGE_MISMATCH = {
  $or: [
    { country: "HU", language: { $ne: "hu" } },
    { country: { $nin: ["HU", null, ""] }, language: "hu" },
  ],
};

export function languageLabel(language: string | null | undefined): string {
  return language === "hu" ? "magyar" : language === "en" ? "angol" : "?";
}
