/**
 * Workable — widget API, kulcs nélkül.
 * https://workable.readme.io/
 *
 * UK és EU kkv-knál gyakori. A `/api/v1/widget/accounts/{subdomain}`
 * endpoint a publikus hirdetéseket adja, regisztráció nélkül.
 *
 * ⚠️ A WIDGET VÁLASZA MÁS, MINT A DOKUMENTÁLT `/spi/v3/jobs` API.
 * Élőben mérve (2026-09-01) a widget MINDEN mezője:
 *
 *   title, shortcode, code, employment_type, telecommuting, department,
 *   url, shortlink, application_url, published_on, created_at,
 *   country, city, state, education, experience, function, industry, locations
 *
 * Amit a doksi ígér, de a widget NEM ad:
 *   • `id` → helyette `shortcode` az azonosító
 *   • `full_title` → nincs, marad a `title`
 *   • `state` mint PUBLIKÁCIÓS állapot → a widgetben a `state` a RÉGIÓ
 *     ("Attica", "Vienna", "New York"). A widget eleve csak publikált
 *     hirdetést ad, ezért nincs mit szűrni — de védekezünk, ha egyszer
 *     mégis megjelenne egy publikációs állapot.
 *   • `location.country_code` → helyette `locations[].countryCode`
 *   • `workplace_type` → helyette `telecommuting: boolean`
 *   • `confidential` → a widget nem adja; a mezőt kezeljük, ha megjelenik
 *   • fizetés-mezők → nincsenek
 *
 * ÜRES FIÓK = ÉRVÉNYES ÁLLAPOT. Mérve: 60 ellenőrzött fiókból 52 él, de
 * nulla nyitott pozícióval. Ezt SOHA ne logold hibaként.
 */
import { getJson, mapLimit } from "../http";
import { guessCountry, toISO } from "../normalize";
import { COMPANIES } from "../companies";
import { defineSource, makeJob as mk } from "./base";
import type { Job } from "../types";

const API = "https://apply.workable.com/api/v1/widget/accounts";
const CONCURRENCY = 5;
const TIMEOUT = 12000;

/** Publikációs állapotok, amiket elfogadunk, ha a mező egyáltalán létezik. */
const PUBLISHED = new Set(["published", "open", "active"]);

interface WorkableLocation {
  country?: string;
  /** ISO-2 — ez a widget országmezője. */
  countryCode?: string;
  city?: string;
  region?: string | null;
  hidden?: boolean;
}

export interface WorkableJob {
  id?: string | number;
  /** A widget azonosítója — `id` NINCS. */
  shortcode?: string;
  code?: string;
  title?: string;
  /** A doksi ígéri, a widget nem adja. */
  full_title?: string;
  /** A widgetben ez a RÉGIÓ, nem publikációs állapot. */
  state?: string;
  confidential?: boolean;
  department?: string;
  employment_type?: string;
  /** A widget remote-jelzője (a `workplace_type` helyett). */
  telecommuting?: boolean;
  workplace_type?: string;
  url?: string;
  shortlink?: string;
  application_url?: string;
  published_on?: string;
  created_at?: string;
  country?: string;
  city?: string;
  locations?: WorkableLocation[];
  keywords?: string[];
  function?: string;
  industry?: string;
  salary_from?: number;
  salary_to?: number;
  salary_currency?: string;
}

/**
 * Publikált-e a hirdetés.
 *
 * A widgetben a `state` a RÉGIÓ neve, nem publikációs állapot — ezért csak
 * akkor szűrünk vele, ha az értéke tényleg publikációs állapotnak látszik.
 * Így a "Vienna" nem ejti ki a hirdetést.
 */
export function isPublished(j: WorkableJob): boolean {
  const state = (j.state ?? "").trim().toLowerCase();
  if (!state) return true;
  // Ismert publikációs értékek: elfogadjuk / elutasítjuk.
  if (PUBLISHED.has(state)) return true;
  if (["draft", "archived", "closed", "internal"].includes(state)) return false;
  // Bármi más (régiónév) nem publikációs információ.
  return true;
}

/**
 * Egy Workable hirdetés → közös Job séma.
 * Exportált, mert a test/workable.test.ts a mentett fixture-ön ellenőrzi.
 */
export function toJob(account: string, j: WorkableJob): Job {
  const loc = j.locations?.[0];
  const city = loc?.city || j.city || undefined;
  const country =
    loc?.countryCode?.toUpperCase() ??
    guessCountry(loc?.country ?? j.country) ??
    guessCountry(city);

  const locationText = [city, loc?.region ?? j.state, loc?.country ?? j.country]
    .filter((p) => p && String(p).trim())
    .join(", ");

  return mk({
    sourceId: "workable",
    raw: j,
    // A widget NEM ad `id`-t — a shortcode az azonosító.
    externalId: String(j.shortcode ?? j.id ?? j.code ?? ""),
    // A full_title informatívabb lenne, de a widget nem adja.
    title: String(j.full_title ?? j.title ?? ""),
    // Bizalmas hirdetésnél a cégnév rejtve — a fiók neve marad.
    company: account,
    url: j.application_url ?? j.shortlink ?? j.url ?? "",
    location: locationText || undefined,
    country,
    // A widget `telecommuting` boolja a remote-jelző.
    remote: j.telecommuting === true || j.workplace_type === "remote",
    confidential: j.confidential === true || undefined,
    employmentType: j.employment_type,
    postedAt: toISO(j.published_on ?? j.created_at),
    tags: [j.department, j.function, j.industry, ...(j.keywords ?? [])]
      .filter(Boolean)
      .slice(0, 10) as string[],
  });
}

export const workable = defineSource({
  meta: {
    id: "workable",
    name: "Workable",
    category: "ats",
    auth: "none",
    regionCodes: ["GB", "IE", "DE", "NL", "AT"],
    rateLimit: null,
    cacheTtlMinutes: 720,
    regions: "UK / EU kkv",
    docs: "https://workable.readme.io/",
    warning:
      "A widget válasza eltér a dokumentált API-tól (nincs id, full_title, country_code; a state a RÉGIÓ). Sok fiók él 0 nyitott pozícióval — ez érvényes állapot, nem hiba.",
  },
  async fetch(_params, signal) {
    return mapLimit(COMPANIES.workable, CONCURRENCY, async (account) => {
      const data = await getJson<{ name?: string; jobs?: WorkableJob[] }>(
        `${API}/${account}`,
        { signal, timeoutMs: TIMEOUT },
      );
      // Az ÜRES jobs[] érvényes állapot: a fiók él, csak nincs nyitott
      // pozíciója. Mérve: 60 fiókból 52 ilyen. Nem hiba, nem logoljuk.
      return (data.jobs ?? [])
        .filter(isPublished)
        .map((j) => toJob(data.name ?? account, j));
    });
  },
});
