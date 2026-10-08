/**
 * Adzuna — a legkomolyabb ingyenes, hivatalos aggregátor.
 * https://developer.adzuna.com/overview
 *
 * Egyetlen integrációval lefedi az AT, NL, ES, DE célországokat (és az US-t).
 * MAGYARORSZÁG NINCS BENNE — HU-ra a Jooble és a Careerjet marad.
 *
 * KVÓTA: 25/perc, 250/nap, 1000/hét, 2500/hó. Ez négy különböző ablak, és
 * mind a négyet külön kell számolni — egy napi számláló nem véd meg a perces
 * limittől, egy perces nem véd a havitól. A `quota.ts` ablakos része ezt adja.
 *
 * A NAPI 250 GYORSAN FOGY, ha országonként × kulcsszavanként keresel. A
 * lekérdezés-mátrix ezért KONFIGBÓL jön, és a modul kiszámolja, hány hívás
 * lesz belőle — lásd `plannedCallsPerRun()`.
 *
 * ⚠️ ToS: kötelező "Jobs by Adzuna" LOGÓ + link (min. 116×23 px) bárhol, ahol
 * az adatot megjeleníted, és "Adzuna Jobsworth" jelölés a BECSÜLT fizetéseknél.
 * Saját álláskeresésre ez nem érint; publikálásnál kötelező. A logót nem
 * csomagoljuk a repóba (védjegy) — a UI szöveges attribúciót tesz ki, a
 * logót publikáláskor kell beszerezni az Adzunától.
 */
import { jobsEnv } from "../env";
import { getJson, sleep, SourceError } from "../http";
import {
  recordWindowedCall,
  windowBlocked,
  windowUsage,
  type WindowLimits,
} from "../quota";
import { guessCountry, num, stripHtml, toISO } from "../normalize";
import { defineSource, makeJob as mk } from "./base";
import type { Job } from "../types";

const API = "https://api.adzuna.com/v1/api/jobs";
const TIMEOUT = 15000;

/** A publikált keret mind a négy ablakra. */
export const ADZUNA_LIMITS: WindowLimits = {
  perMinute: 25,
  perDay: 250,
  perWeek: 1000,
  perMonth: 2500,
};

const QUOTA_ID = "adzuna";

/** A perces limit 25 — a 2,5 mp-es ütem biztonsággal alatta marad. */
const THROTTLE_MS = 2500;

const RESULTS_PER_PAGE = 50;

/* ------------------------------------------------- lekérdezés-mátrix */

/**
 * A mátrix konfigból jön: ország × kulcsszó × oldal.
 *
 * A napi 250-es keret így tervezhető. Az alapértelmezés
 * 4 ország × 1 kulcsszó × 1 oldal = 4 hívás/futás, ami napi 60 futást enged.
 * Aki bővíti, a `plannedCallsPerRun()`-nal ellenőrizheti, mit vállal.
 */
export interface QueryMatrix {
  countries: string[];
  keywords: string[];
  pages: number;
}

export function queryMatrix(): QueryMatrix {
  const countries = (jobsEnv("ADZUNA_COUNTRIES") ?? "at,nl,es,de")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  const keywords = (jobsEnv("ADZUNA_KEYWORDS") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const pages = Math.max(1, Number(jobsEnv("ADZUNA_PAGES") ?? 1));
  return { countries, keywords, pages };
}

/** Hány hívás megy ki egy futásban. A keret tervezéséhez. */
export function plannedCallsPerRun(
  m: QueryMatrix,
  fallbackKeywords = 1,
): number {
  return (
    m.countries.length * Math.max(m.keywords.length, fallbackKeywords) * m.pages
  );
}

/* ----------------------------------------------------------- leképezés */

export interface AdzunaJob {
  id?: string | number;
  title?: string;
  company?: { display_name?: string };
  /** A `area` HIERARCHIKUS: ["Austria", "Wien", "Wien"] — az első az ország. */
  location?: { display_name?: string; area?: string[] };
  salary_min?: number;
  salary_max?: number;
  /** "1" = az Adzuna BECSLÉSE, nem a hirdetésé. */
  salary_is_predicted?: string | number;
  description?: string;
  redirect_url?: string;
  created?: string;
  category?: { label?: string; tag?: string };
  contract_type?: string;
  contract_time?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * A `location.area[]` hierarchikus: az ELSŐ elem az ország, az utolsó a
 * legszűkebb hely. Ez a legkönnyebben feldolgozható lokáció-mező az
 * aggregátorok között — de csak akkor, ha a sorrendet tiszteletben tartjuk.
 */
export function countryFromArea(
  area?: string[],
  fallbackCountry?: string,
): string | undefined {
  const named = area?.[0] ? guessCountry(area[0]) : undefined;
  return named ?? (fallbackCountry ? fallbackCountry.toUpperCase() : undefined);
}

export function cityFromArea(area?: string[]): string | undefined {
  if (!area?.length) return undefined;
  return area[area.length - 1] || undefined;
}

/**
 * Egy Adzuna hirdetés → közös Job séma.
 * Exportált, mert a test/adzuna.test.ts a fixture-ön ellenőrzi.
 */
export function toJob(j: AdzunaJob, country: string): Job {
  // "1" (string) és 1 (szám) is előfordulhat.
  const estimated = String(j.salary_is_predicted ?? "") === "1";

  return mk({
    sourceId: "adzuna",
    raw: j,
    externalId: String(j.id ?? ""),
    title: String(j.title ?? ""),
    company: String(j.company?.display_name ?? ""),
    url: j.redirect_url ?? "",
    location: j.location?.display_name ?? cityFromArea(j.location?.area),
    country: countryFromArea(j.location?.area, country),
    remote: false,
    description: stripHtml(j.description),
    salaryMin: num(j.salary_min),
    salaryMax: num(j.salary_max),
    currency: undefined,
    salaryPeriod: "year",
    // A becsült fizetést MEGJELÖLJÜK. Tényként kezelve hamis képet adna, és
    // az Adzuna ToS-e is külön jelölést ír elő rá.
    salaryIsEstimate: estimated || undefined,
    employmentType: j.contract_time ?? j.contract_type,
    postedAt: toISO(j.created),
    tags: j.category?.label ? [j.category.label] : undefined,
  });
}

/* --------------------------------------------------------------- forrás */

export const adzuna = defineSource({
  meta: {
    id: "adzuna",
    name: "Adzuna",
    category: "aggregator",
    auth: "key",
    envKeys: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
    regionCodes: ["AT", "NL", "ES", "DE", "US"],
    rateLimit: { perMinute: 25, perDay: 250, perMonth: 2500 },
    cacheTtlMinutes: 360,
    regions: "AT, NL, ES, DE, US (HU NINCS benne)",
    docs: "https://developer.adzuna.com/overview",
    warning:
      'Kötelező "Jobs by Adzuna" attribúció, ha megjeleníted. A becsült fizetés (salaryIsEstimate) nem a hirdetésé. 250 hívás/nap, négy időablakkal.',
    attribution: { label: "Jobs by Adzuna", url: "https://www.adzuna.com" },
  },
  async fetch(params, signal) {
    if (jobsEnv("ADZUNA_LIVE") !== "1") {
      throw new SourceError(
        "Az élő hívás ki van kapcsolva (napi 250 hívás a keret). Bekapcsolás: ADZUNA_LIVE=1.",
        "config",
      );
    }

    const appId = jobsEnv("ADZUNA_APP_ID");
    const appKey = jobsEnv("ADZUNA_APP_KEY");
    if (!appId || !appKey)
      throw new SourceError("Hiányzó ADZUNA_APP_ID / ADZUNA_APP_KEY", "config");

    const matrix = queryMatrix();
    const keywords = matrix.keywords.length
      ? matrix.keywords
      : [params.q || "software developer"];
    const out: Job[] = [];
    let first = true;

    for (const country of matrix.countries) {
      for (const what of keywords) {
        for (let page = 1; page <= matrix.pages; page++) {
          const blocked = await windowBlocked(QUOTA_ID, ADZUNA_LIMITS);
          if (blocked) {
            const used = await windowUsage(QUOTA_ID);
            throw new SourceError(
              `Adzuna kvóta betelt (${blocked}): ${JSON.stringify(used)}. A keret magától megújul.`,
              "config",
            );
          }

          if (!first) await sleep(THROTTLE_MS);
          first = false;

          const qs = new URLSearchParams({
            app_id: appId,
            app_key: appKey,
            what,
            results_per_page: String(RESULTS_PER_PAGE),
            sort_by: "date",
            // Enélkül XML-t is adhat.
            "content-type": "application/json",
          });
          const where = jobsEnv("ADZUNA_WHERE");
          if (where) qs.set("where", where);

          try {
            const data = await getJson<{ results?: AdzunaJob[] }>(
              `${API}/${country}/search/${page}?${qs}`,
              { signal, timeoutMs: TIMEOUT, retries: 0 },
            );
            out.push(...(data.results ?? []).map((j) => toJob(j, country)));
          } catch {
            // Egy ország hibája ne vigye el a többit.
          } finally {
            await recordWindowedCall(QUOTA_ID, ADZUNA_LIMITS);
          }
        }
      }
    }

    return out;
  },
});
