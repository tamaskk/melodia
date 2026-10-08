/**
 * Personio job feed (XML) — a DACH-piac kkv- és startup-forrása.
 *
 * Nincs hivatalos fejlesztői doksi: ez egy konvenció, ami az aggregátorok
 * indexeléséhez készült. Nyilvános és stabil, de nincs mögötte szerződéses
 * garancia — ha egyszer elnémul, ez az oka.
 *
 * HÁROM CSAPDA, mind élőben reprodukálható:
 *   1. A gyökér elem <workzag-jobs> — a Personio RÉGI cégneve.
 *   2. Egyetlen <position> esetén a parser OBJEKTUMOT ad, nem tömböt.
 *      A 23 subdomainünkből háromnak (personio, websale-ag, yapeal-ag)
 *      tényleg egyetlen hirdetése van, tehát ez nem elméleti eset.
 *   3. Ugyanez az <additionalOffices><office> elemre is igaz.
 *
 * A LEÍRÁS NÉMETÜL VAN. Nem fordítunk: a keresőt tanítottuk meg németül
 * (normalize.ts SYNONYMS), így a "developer" megtalálja az "Entwickler"-t.
 * Determinisztikus és offline. Az LLM-es fordítás a 21-es task dolga.
 */
import { XMLParser } from "fast-xml-parser";
import { getText, mapLimit } from "../http";
import { guessCountry, looksRemote, stripHtml, toISO } from "../normalize";
import { COMPANIES } from "../companies";
import { defineSource, makeJob as mk } from "./base";
import type { Job } from "../types";

const CONCURRENCY = 5;
const TIMEOUT = 12000;

const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });

/**
 * Egyetlen elem esetén a parser objektumot ad, nem tömböt. Ez a feed
 * legklasszikusabb hibaforrása — minden ismétlődő elemet ezen kell átvezetni.
 */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (Array.isArray(value)) return value;
  return value == null || value === "" ? [] : [value];
}

interface PersonioDescription {
  name?: unknown;
  value?: unknown;
}

export interface PersonioPosition {
  id?: unknown;
  subcompany?: unknown;
  office?: unknown;
  additionalOffices?: { office?: unknown } | string;
  department?: unknown;
  recruitingCategory?: unknown;
  /** A pozíció CÍME — nem a cég neve. */
  name?: unknown;
  jobDescriptions?:
    { jobDescription?: PersonioDescription | PersonioDescription[] } | string;
  employmentType?: unknown;
  seniority?: unknown;
  schedule?: unknown;
  yearsOfExperience?: unknown;
  occupation?: unknown;
  occupationCategory?: unknown;
  createdAt?: unknown;
}

const str = (v: unknown): string | undefined => {
  if (v == null || v === "") return undefined;
  const s = String(v).trim();
  return s || undefined;
};

/**
 * A jobDescriptions beágyazott szerkezet több szekcióval (Aufgaben, Profil,
 * Wir bieten) — nem egy sima string. A szekciócímeket is megtartjuk, mert
 * a német hirdetéseknél a "Wir bieten" blokk hordozza a juttatásokat.
 */
function joinDescriptions(
  jd: PersonioPosition["jobDescriptions"],
): string | undefined {
  if (!jd || typeof jd === "string")
    return stripHtml(typeof jd === "string" ? jd : undefined);
  const sections = asArray(jd.jobDescription);
  const text = sections
    .map((d) => {
      // A szekció szövegét külön tisztítjuk, hogy a bekezdés-sortörés ne
      // ékelődjön a szekciócím és a tartalom KÖZÉ.
      const name = str(d?.name);
      const value = stripHtml(str(d?.value));
      return [name, value].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
  return text || undefined;
}

/**
 * Egy Personio pozíció → közös Job séma.
 * Exportált, mert a test/personio.test.ts a mentett fixture-ön ellenőrzi.
 */
export function toJob(subdomain: string, p: PersonioPosition): Job {
  // office + additionalOffices együtt adja a teljes lokációt.
  const extra =
    typeof p.additionalOffices === "object" && p.additionalOffices
      ? asArray(p.additionalOffices.office)
      : [];
  const offices = [str(p.office), ...extra.map(str)].filter(
    Boolean,
  ) as string[];
  const location = offices.join(", ") || undefined;

  const title = str(p.name) ?? "";
  const description = joinDescriptions(p.jobDescriptions);

  // Alapértelmezés DE, de ha az iroda osztrák vagy svájci várost ad, az nyer.
  // A sorrend számít: előbb a felismert ország, csak utána az alapértelmezés.
  const country = offices.map((o) => guessCountry(o)).find(Boolean) ?? "DE";

  return mk({
    sourceId: "personio",
    raw: p,
    externalId: String(str(p.id) ?? title),
    title,
    // A `name` a pozíció címe; a cégnév a subcompany-ban vagy a subdomainben van.
    company: str(p.subcompany) ?? subdomain,
    url: `https://${subdomain}.jobs.personio.de/job/${str(p.id) ?? ""}`,
    location,
    country,
    remote: looksRemote(location, title, description),
    description,
    seniority: str(p.seniority),
    employmentType: str(p.employmentType) ?? str(p.schedule),
    postedAt: toISO(str(p.createdAt)),
    tags: [
      str(p.department),
      str(p.recruitingCategory),
      str(p.occupationCategory),
    ].filter(Boolean) as string[],
  });
}

/** Egy feed szövegéből pozíciók. Exportált, hogy fixture-ön is futtatható legyen. */
export function parseFeed(subdomain: string, xmlText: string): Job[] {
  const doc = parser.parse(xmlText) as Record<
    string,
    { position?: unknown } | undefined
  >;
  // A gyökér <workzag-jobs>; a <personio-jobs> csak elvi tartalék.
  const root = doc["workzag-jobs"] ?? doc["personio-jobs"] ?? {};
  return (
    asArray(root?.position as PersonioPosition | PersonioPosition[])
      .map((p) => toJob(subdomain, p))
      // Cím nélküli sor nem hirdetés; a toResult amúgy is eldobná, de így
      // nem terheli a dropped számlálót zajjal.
      .filter((j) => j.title)
  );
}

export const personio = defineSource({
  meta: {
    id: "personio",
    name: "Personio (XML)",
    category: "ats",
    auth: "none",
    regionCodes: ["DE", "AT", "CH"],
    rateLimit: null,
    cacheTtlMinutes: 720,
    regions: "DACH",
    docs: "https://www.personio.com/",
    warning:
      "Német nyelvű hirdetések; a kereső szinonimákkal hidalja át. A gyökér elem <workzag-jobs>, a Personio régi neve. Nincs hivatalos doksi.",
  },
  async fetch(_params, signal) {
    return mapLimit(COMPANIES.personio, CONCURRENCY, async (subdomain) => {
      const text = await getText(`https://${subdomain}.jobs.personio.de/xml`, {
        signal,
        timeoutMs: TIMEOUT,
      });
      return parseFeed(subdomain, text);
    });
  },
});
