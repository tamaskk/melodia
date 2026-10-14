import { COUNTRIES, countryLabel } from "@/lib/countries";
import type { Contact } from "@/lib/types";
import imported from "./imported.json";

interface ImportedFile {
  generatedAt: string;
  sourceLabels: Record<string, string>;
  contacts: Contact[];
}

const dataset = imported as unknown as ImportedFile;

/**
 * Országkód → zászlós magyar címke. A lista a `src/lib/countries.ts`-ből jön,
 * hogy a szűrő, az import és az export ugyanazt az országhalmazt ismerje.
 */
export const COUNTRY_LABELS: Record<string, string> = Object.fromEntries(
  Object.keys(COUNTRIES).map((code) => [code, countryLabel(code)]),
);

/**
 * Human readable name for every source PDF family, plus the sources the
 * importer generates on its own (IT companies have no PDF behind them).
 */
export const SOURCE_LABELS: Record<string, string> = {
  ...dataset.sourceLabels,
  ...Object.fromEntries(
    Object.entries(COUNTRIES).flatMap(([code, info]) => [
      [
        `it-companies-${code.toLowerCase()}`,
        // Az ország neve is benne van, hogy a keresőben "lengyel"-re előjöjjön.
        `${info.flag} IT cégek · ${info.hu}`,
      ],
      // Az ismeretlen országú Clutch-cégek forrása külön kulcs, lásd lent.
      ...(code === "INT"
        ? []
        : [
            [
              `clutch_companies_${code.toLowerCase()}`,
              `${info.flag} Clutch Companies ${code}`,
            ],
          ]),
    ]),
  ),
  // A Clutch három országot nem ISO-kóddal jelöl, a forrás neve ezt őrzi.
  clutch_companies_yu: `${COUNTRIES.RS.flag} Clutch Companies RS`,
  clutch_companies_fx: `${COUNTRIES.FR.flag} Clutch Companies FR`,
  clutch_companies_dy: `${COUNTRIES.BJ.flag} Clutch Companies BJ`,
  clutch_companies_unknown: `${COUNTRIES.INT.flag} Clutch Companies · ismeretlen ország`,
};

export const GENERATED_AT = dataset.generatedAt;

/**
 * Every contact parsed out of the PDFs (see scripts/parse-pdfs.ts).
 * Already deduplicated at parse time.
 */
export function allSeedContacts(): Contact[] {
  return dataset.contacts;
}
