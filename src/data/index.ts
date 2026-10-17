import { COUNTRIES, countryLabel, toCountryCode } from "@/lib/countries";
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
      [
        `seedtable-${code.toLowerCase()}`,
        `${info.flag} Seedtable · ${info.hu}`,
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
  "kezi-felvetel": "Kézi felvétel",
};

/** Rövidítések, amiket a GoodFirms-kategóriában nem elég nagybetűvel kezdeni. */
const CATEGORY_WORDS: Record<string, string> = {
  ai: "AI",
  ios: "iOS",
  ui: "UI",
  ux: "UX",
  seo: "SEO",
  erp: "ERP",
  crm: "CRM",
  iot: "IoT",
  saas: "SaaS",
};

/**
 * Forráskulcs → megjeleníthető címke. A fix címkéken túl a GoodFirms-importok
 * kulcsait is felismeri: `goodfirms_companies_[kategória_]ország`, pl.
 * `goodfirms_companies_android_us` → „🇺🇸 GoodFirms · Android · Egyesült Államok”.
 * Ismeretlen kulcsnál magát a kulcsot adja vissza.
 */
export function sourceLabel(source: string): string {
  const fixed = SOURCE_LABELS[source];
  if (fixed) return fixed;

  // `_unknown`: a forrás sem tudta az országot — nálunk ez a Nemzetközi.
  const goodfirms = /^goodfirms_companies_(?:(.+)_)?([a-z]{2,3}|unknown)$/.exec(
    source,
  );
  // A régi kódokat (yu, fx, dy, hv) is ugyanúgy fordítjuk, mint importkor.
  const country =
    goodfirms &&
    COUNTRIES[goodfirms[2] === "unknown" ? "INT" : toCountryCode(goodfirms[2])];
  if (!goodfirms || !country) {
    // Külső API-ból (docs/COMPANY_API.md): gridleads_<üzlettípus>_<ország>.
    const gridleads = /^gridleads_(.+)_([a-z]{2}|int)$/.exec(source);
    const where = gridleads && COUNTRIES[toCountryCode(gridleads[2])];
    if (!gridleads || !where) return source;
    return `${where.flag} Gridleads · ${gridleads[1].replace(/-/g, " ")} · ${where.hu}`;
  }

  const category = goodfirms[1]
    // `webDevelopment`, `web_development` és `web-development` is jöhet.
    ?.split(/[_-]+|(?=[A-Z])/)
    .map(
      (word) =>
        CATEGORY_WORDS[word.toLowerCase()] ??
        word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
  return [`${country.flag} GoodFirms`, category, country.hu]
    .filter(Boolean)
    .join(" · ");
}

export const GENERATED_AT = dataset.generatedAt;

/**
 * Every contact parsed out of the PDFs (see scripts/parse-pdfs.ts).
 * Already deduplicated at parse time.
 */
export function allSeedContacts(): Contact[] {
  return dataset.contacts;
}
