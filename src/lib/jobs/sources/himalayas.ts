/**
 * Himalayas — remote board VALÓDI országszűrővel.
 * https://himalayas.app/docs/remote-jobs-api
 *
 * EZ A TASK FŐ HOZADÉKA nem a hirdetésszám, hanem a `locationRestrictions`:
 * megmondja, HONNAN lehet dolgozni. A legtöbb board ezt elhallgatja, és
 * ezért jelentkezel olyan „remote" állásokra, amikre Magyarországról nem is
 * lehetne. Itt ezeket eldobjuk.
 *
 * ÉLŐBEN MÉRVE (2026-09-01):
 *   • `limit=50` esetén is 20 elem jön — a doksi felső korlátja igaz.
 *   • A cursoros lapozás tiszta: két egymást követő oldal között 0 átfedés.
 *   • A `seniority` TÖMB (`["Senior"]`), nem string.
 *   • A `timezoneRestrictions` SZÁMOK: UTC-eltolások (`[-10,-9,…,14]`,
 *     és tört értékek is, pl. `5.5`).
 *   • Az `updatedAt` Unix-másodperc, nem ISO.
 *   • `country=Hungary` szűrő működik: 105 575 hirdetésből 2 364.
 *
 * ⚠️ ToS: "no API key or authentication required", de napi egynél gyakrabban
 * ne pollozz. A cache TTL ezért 24 óra, `updatedAt`-alapú invalidálással.
 */
import { getJson } from "../http";
import { getCached, getStamp, setCached, touchCached } from "../cache";
import {
  eligibleCountries,
  guessCountry,
  isReachableFrom,
  num,
  stripHtml,
  toISO,
} from "../normalize";
import { defineSource, makeJob as mk } from "./base";
import type { Job, SalaryPeriod } from "../types";

const API = "https://himalayas.app/jobs/api";
const TIMEOUT = 15000;

/** A doksi felső korlátja; élőben ellenőrizve, nagyobb érték sem ad többet. */
const PAGE_SIZE = 20;

/** Végtelen ciklus ellen: a cursor elvileg mindig ad következőt. */
const MAX_PAGES = 15;

/** Naponta egy teljes szinkron a helyes ütem (ToS). */
const CACHE_TTL_MINUTES = 24 * 60;

const CACHE_KEY = "himalayas:jobs";

export interface HimalayasJob {
  title?: string;
  excerpt?: string;
  companyName?: string;
  companySlug?: string;
  employmentType?: string;
  minSalary?: number;
  maxSalary?: number;
  /** "annual" | "monthly" | "hourly" */
  salaryPeriod?: string;
  /** TÖMB, nem string: ["Senior"]. */
  seniority?: string[] | string;
  currency?: string;
  /** Országnevek szabadszövegként. Üres = bárhonnan. */
  locationRestrictions?: string[];
  /** SZÁMOK: megengedett UTC-eltolások. Üres = nincs korlátozás. */
  timezoneRestrictions?: number[];
  categories?: string[];
  parentCategories?: string[];
  description?: string;
  pubDate?: string | number;
  expiryDate?: string | number;
  applicationLink?: string;
  guid?: string;
}

/** CET = UTC+1, nyári időszámításban +2. Üres korlátozás = bármelyik jó. */
export { isReachableFrom };

export function isCetCompatible(timezones?: number[]): boolean {
  if (!timezones?.length) return true;
  return timezones.some((tz) => tz === 1 || tz === 2);
}

export function toSalaryPeriod(period?: string): SalaryPeriod | undefined {
  const p = (period ?? "").toLowerCase();
  if (p.startsWith("annual") || p.startsWith("year")) return "year";
  if (p.startsWith("month")) return "month";
  if (p.startsWith("hour")) return "hour";
  return undefined;
}

/** A seniority tömbként jön — az elsőt vesszük, string bemenetet is elfogadva. */
export function normalizeSeniority(
  value?: string[] | string,
): string | undefined {
  if (Array.isArray(value)) return value[0] || undefined;
  return value || undefined;
}

/**
 * Egy Himalayas hirdetés → közös Job séma.
 * Exportált, mert a test/himalayas.test.ts a mentett fixture-ön ellenőrzi.
 */
export function toJob(j: HimalayasJob): Job {
  const restrictions = j.locationRestrictions ?? [];
  const countries = [
    ...new Set(
      restrictions
        .map((r) => guessCountry(r))
        .filter((c): c is string => Boolean(c)),
    ),
  ];

  return mk({
    sourceId: "himalayas",
    raw: j,
    externalId: String(j.guid ?? j.applicationLink ?? ""),
    title: String(j.title ?? ""),
    company: String(j.companyName ?? j.companySlug ?? ""),
    url: j.applicationLink ?? "",
    // A korlátozás egyben a lokáció leírása is: ez mondja meg, honnan lehet.
    location: restrictions.length ? restrictions.join(", ") : "Remote",
    country: countries[0],
    alsoCountries: countries.length > 1 ? countries.slice(1) : undefined,
    remote: true,
    description: stripHtml(j.description ?? j.excerpt),
    salaryMin: num(j.minSalary),
    salaryMax: num(j.maxSalary),
    currency: j.currency,
    salaryPeriod: toSalaryPeriod(j.salaryPeriod),
    seniority: normalizeSeniority(j.seniority),
    employmentType: j.employmentType,
    timezones: j.timezoneRestrictions?.length
      ? j.timezoneRestrictions
      : undefined,
    postedAt: toISO(j.pubDate),
    expiresAt: toISO(j.expiryDate),
    tags: [...(j.categories ?? []), ...(j.parentCategories ?? [])]
      .map(String)
      .slice(0, 10),
  });
}

interface HimalayasResponse {
  jobs?: HimalayasJob[];
  nextCursor?: string | null;
  totalCount?: number;
  /** Unix-MÁSODPERC, nem ISO. */
  updatedAt?: number;
}

export const himalayas = defineSource({
  meta: {
    id: "himalayas",
    name: "Himalayas",
    category: "remote",
    auth: "none",
    regionCodes: ["global"],
    rateLimit: null,
    cacheTtlMinutes: CACHE_TTL_MINUTES,
    regions: "Globális remote, országszűrővel",
    docs: "https://himalayas.app/docs/remote-jobs-api",
    warning:
      "Naponta frissül, napi egynél gyakrabban ne pollozd. A locationRestrictions alapján eldobjuk azokat a hirdetéseket, ahonnan HU/EU nem elérhető.",
  },
  async fetch(_params, signal) {
    const cached = getCached<Job[]>(CACHE_KEY);
    if (cached) return cached;

    const eligible = eligibleCountries("HIMALAYAS_ELIGIBLE_COUNTRIES");
    const raw: HimalayasJob[] = [];
    let cursor: string | null = null;
    let stamp: number | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
      // Az `offset` DEPRECATED — kizárólag cursorral lapozunk.
      if (cursor) qs.set("cursor", cursor);

      // A 429-et a közös http.ts kezeli exponenciális backoff-fal.
      const data: HimalayasResponse = await getJson<HimalayasResponse>(
        `${API}?${qs}`,
        {
          signal,
          timeoutMs: TIMEOUT,
          retries: 2,
        },
      );

      stamp ??= data.updatedAt;
      raw.push(...(data.jobs ?? []));

      cursor = data.nextCursor ?? null;
      // A cursor hiánya a megállás; a MAX_PAGES csak a végtelen ciklus ellen van.
      if (!cursor || !(data.jobs ?? []).length) break;
    }

    // A forrás bélyege alapján: ha nem változott, nem dolgozzuk fel újra.
    const stampKey = stamp != null ? String(stamp) : undefined;
    if (stampKey && getStamp(CACHE_KEY) === stampKey) {
      const kept = touchCached<Job[]>(CACHE_KEY, CACHE_TTL_MINUTES);
      if (kept) return kept;
    }

    // ITT A LÉNYEG: eldobjuk, amire innen nem lehet jelentkezni.
    const reachable = raw
      .filter((j) => isReachableFrom(j.locationRestrictions, eligible))
      .map(toJob);

    return setCached(CACHE_KEY, reachable, CACHE_TTL_MINUTES, stampKey);
  },
});
