/**
 * A saját adataid egy helyen — az űrlapos jelentkezés másolható csomagja
 * ebből épül. (A levélsablonok egyelőre a templates.ts-ben élnek; a későbbi
 * profil-oldal ezt a modult teszi szerkeszthetővé.)
 *
 * Csak olyan adat van itt, ami a kiküldött levelekben is szerepel.
 */
export const PROFILE = {
  name: "Kálmán Tamás Krisztián",
  email: "kalman.tamaskrisztian@gmail.com",
  phone: "+36 70 315 7553",
  city: "Budapest",
  github: "github.com/tamaskk",
  portfolio: "tamaskk.com",
  stack: "TypeScript, React/Next.js, Angular, Node.js/NestJS, MongoDB",
  /** Ahogy a levelekben szerepel (betűre — a kiküldött szövegek nem változhatnak). */
  stackLetter: "TypeScript, React/Next.js, Angular, NodeJS, NestJS, MongoDB",
} as const;

/** Rövid bemutatkozás űrlapok „About you / Bemutatkozás” mezőjébe. */
export function shortIntro(language: "hu" | "en" | string): string {
  return language === "hu"
    ? `${PROFILE.name} vagyok, ${PROFILE.city}en élő full stack fejlesztő (${PROFILE.stack}). ` +
        "Legutóbb a BLCKS-nél dolgoztam, ahol junior fejlesztőből medior pozícióba léptem elő, " +
        "és több terméket vittem végig a specifikációtól az élesítésig."
    : `I'm ${PROFILE.name}, a ${PROFILE.city}-based full stack developer (${PROFILE.stack}). ` +
        "Most recently I worked at BLCKS, where I was promoted from junior to mid-level developer " +
        "and shipped several products from spec to production.";
}
