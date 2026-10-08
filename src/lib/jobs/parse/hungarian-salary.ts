/**
 * Magyar fizetésszöveg értelmezése.
 *
 * A Jooble (és a magyar hirdetések általában) szabadszövegben adják a bért:
 *   "400 000 - 600 000 Ft/hó"
 *   "bruttó 1.200.000 Ft/hónap"
 *   "5 000 Ft/óra"
 *   "havi 800e Ft"
 * Nincs strukturált mező, tehát parser kell — enélkül a magyar hirdetéseknek
 * sosem lenne fizetésadatuk.
 */
import type { SalaryPeriod } from "../types";

export interface ParsedSalary {
  min?: number;
  max?: number;
  currency?: string;
  period?: SalaryPeriod;
  /** "bruttó" | "nettó", ha a szöveg megmondja. A séma nem tárolja, de a raw igen. */
  gross?: boolean;
}

const CURRENCIES: [RegExp, string][] = [
  [/\b(ft|huf|forint)\b|\bft\/|ft$/i, "HUF"],
  [/€|\beur\b|\beuro\b/i, "EUR"],
  [/\$|\busd\b/i, "USD"],
  [/£|\bgbp\b/i, "GBP"],
];

/**
 * FIGYELEM a szóhatárokra. A `\b` az ékezetes betűk MELLETT is illeszkedik
 * (a JS-ben az "ó" nem szó-karakter), ezért a `\/(óra|h)\b` minta a "/hó"-ra
 * is illeszkedett, és a havi bért óraként értelmezte. Ékezetes szavaknál
 * ezért nem használunk `\b`-t, és a HOSSZABB alakot tesszük előre.
 */
const PERIODS: [RegExp, SalaryPeriod][] = [
  [/\/\s*(óra|ora)|óránként|oránként|orankent|hourly|per hour/i, "hour"],
  [/\/\s*(hónap|honap|hó|ho)|havonta|havi|monthly|per month/i, "month"],
  [/\/\s*(év|ev)|évente|evente|évi|evi|yearly|annual/i, "year"],
];

/**
 * Számok kinyerése a magyar írásmódból.
 *
 * A magyar ezreselválasztó szóköz vagy pont ("400 000", "1.200.000"), a
 * tizedesjel vessző. Az "e" és a "k" utótag ezret jelent ("800e Ft").
 * Ez a legkényesebb rész: rossz elválasztó-kezelésnél a 400 000-ből 400 lesz.
 */
function extractNumbers(text: string): number[] {
  const out: number[] = [];
  /*
   * A számrész MOHÓN illeszkedik, és SZÁMJEGGYEL kell végződnie — így a
   * "400 000" egyben marad. Lusta illesztéssel "400"-ra és "000"-ra esne
   * szét, és 400 000-ből 400 lenne.
   *
   * A szorzó-utótagok HOSSZABB alakja áll elöl, különben az "m" elnyelné a
   * "millió" elejét, és 1,2 millióból 12 lenne.
   */
  const re = /(\d[\d\s.,]*\d|\d)\s*(millió|millio|ezer|mft|m|e|k)?/gi;

  for (const m of text.matchAll(re)) {
    const raw = m[1].trim();
    const suffix = (m[2] ?? "").toLowerCase();
    if (!raw) continue;

    const multiplier =
      suffix === "e" || suffix === "k" || suffix === "ezer"
        ? 1000
        : suffix.startsWith("milli") || suffix === "mft" || suffix === "m"
          ? 1_000_000
          : 1;

    // Elválasztó vs. tizedesjel: "400 000" ezres, de "1,2 millió" tizedes.
    // A megkülönböztetés a szorzón múlik — szorzó nélkül a magyar bérben
    // nincs tizedes.
    let value: number;
    const decimal = raw.match(/^(\d+)[.,](\d{1,2})$/);
    if (multiplier > 1 && decimal) {
      value = Number(`${decimal[1]}.${decimal[2]}`);
    } else {
      const digits = raw.replace(/[\s.,]/g, "");
      if (!digits) continue;
      value = Number(digits);
    }

    if (!isFinite(value) || value <= 0) continue;
    out.push(value * multiplier);
  }
  return out;
}

/**
 * Szabadszöveges magyar fizetés → strukturált adat.
 *
 * @returns üres objektum, ha semmi értelmeset nem találtunk. Inkább semmi,
 *          mint félreértett szám.
 */
export function parseHungarianSalary(text?: string | null): ParsedSalary {
  if (!text) return {};
  const s = String(text).replace(/ /g, " ").trim();
  if (!s) return {};

  const currency = CURRENCIES.find(([re]) => re.test(s))?.[1];
  const period = PERIODS.find(([re]) => re.test(s))?.[1];

  const numbers = extractNumbers(s).filter((n) => n >= 100);
  if (!numbers.length) return { currency, period };

  // Két vagy több szám: a legkisebb és a legnagyobb adja a sávot. Ez
  // robusztusabb, mint a sorrendre hagyatkozni ("600 000-tól 400 000-ig").
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);

  const gross = /\bbrutt/i.test(s)
    ? true
    : /\bnett/i.test(s)
      ? false
      : undefined;

  return {
    min,
    max: max > min ? max : undefined,
    currency,
    period,
    gross,
  };
}
