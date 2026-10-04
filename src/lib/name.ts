import { PROFILE } from "./profile";

/**
 * A jelölt neve minden szövegben "Kálmán Tamás Krisztián".
 *
 * Az AI-tól visszakapott levelek hol angol sorrendben ("Tamás Krisztián
 * Kálmán"), hol két névvel ("Kálmán Tamás") írják — importkor egységesítjük.
 */
export const FULL_NAME = PROFILE.name;

const VARIANTS: [RegExp, string][] = [
  [/Tamás Krisztián Kálmán/g, FULL_NAME],
  [/Krisztián Tamás Kálmán/g, FULL_NAME],
  [/Kálmán Tamás Krisztián/g, FULL_NAME],
  [/Kálmán Tamás(?! Krisztián)/g, FULL_NAME],
  [/Tamás Kálmán(?!á)/g, FULL_NAME],
];

export function normaliseName(text: string): string {
  let value = text;
  for (const [pattern, replacement] of VARIANTS) {
    value = value.replace(pattern, replacement);
  }
  return value;
}
