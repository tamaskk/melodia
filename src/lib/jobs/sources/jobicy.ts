/**
 * Jobicy — remote job feed.
 * https://github.com/Jobicy/remote-jobs-api
 *
 * A legjobban strukturált ingyenes remote API: geo/industry/tag szűrő,
 * fizetéssáv, és külön TAXONÓMIA-endpoint, ami megadja az érvényes
 * szűrőértékeket. Nem találgatunk — lekérjük őket.
 *
 * A jobGeo gyakran TÖBB ORSZÁGOT sorol fel egy stringben:
 *   "Austria,  Croatia,  Germany,  Hungary,  Italy,  Portugal,  Spain,  UK"
 * Az elsőt tesszük a `country`-ba, a többit az `alsoCountries`-be — enélkül
 * egy magyar szűrés pont az ilyen hirdetéseket veszítené el.
 *
 * ⚠️ ToS: fair use. Saját álláskeresésre rendben; a hirdetések továbbadása
 * versenyző aggregátoroknak (Google Jobs, LinkedIn, Jooble) tilos.
 */
import { getJson } from "../http";
import { guessCountry, num, stripHtml, toISO } from "../normalize";
import { getCached, getStamp, setCached, touchCached } from "../cache";
import { defineSource, makeJob as mk } from "./base";
import type { Job, SalaryPeriod } from "../types";

const API = "https://jobicy.com/api/v2/remote-jobs";
const TIMEOUT = 15000;

/** A doksi szerinti felső korlát. Élőben a 150 is átment, de nem élünk vele. */
const COUNT = 100;

/** A hirdetéslista cache-e. A Jobicy naponta többször frissül. */
const JOBS_TTL_MINUTES = 60;

/** A taxonómia gyakorlatilag állandó — elég naponta egyszer. */
const TAXONOMY_TTL_MINUTES = 1440;

const JOBS_KEY = "jobicy:jobs";
const GEO_KEY = "jobicy:taxonomy:locations";
const INDUSTRY_KEY = "jobicy:taxonomy:industries";

export interface JobicyJob {
  id: number | string;
  url?: string;
  jobSlug?: string;
  jobTitle?: string;
  companyName?: string;
  companyLogo?: string;
  /** TÖMB, nem string. */
  jobIndustry?: string[];
  /** TÖMB, nem string. */
  jobType?: string[];
  /** Szabadszöveg, gyakran vesszős felsorolás: "Germany,  Hungary,  UK". */
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
  salaryMin?: number | string;
  salaryMax?: number | string;
  salaryCurrency?: string;
  /** "yearly" | "monthly" | "hourly" — normalizálni kell. */
  salaryPeriod?: string;
}

interface JobicyResponse {
  jobCount?: number;
  /** ISO-8601. Ebből látszik, érdemes-e egyáltalán újra feldolgozni. */
  lastUpdate?: string;
  jobs?: JobicyJob[];
}

/** A Jobicy periódusnevei → a közös séma. */
export function toSalaryPeriod(period?: string): SalaryPeriod | undefined {
  const p = (period ?? "").toLowerCase();
  if (p.startsWith("year") || p === "annual") return "year";
  if (p.startsWith("month")) return "month";
  if (p.startsWith("hour")) return "hour";
  return undefined;
}

/**
 * A jobGeo felsorolásból országkódok.
 *
 * A régiónevek ("Europe", "EMEA", "Anywhere", "APAC") szándékosan nem adnak
 * országot: azok nem országok, és hamis szűrést okoznának.
 */
export function geoCountries(jobGeo?: string): string[] {
  if (!jobGeo) return [];
  const parts = jobGeo
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const codes = parts.map((p) => guessCountry(p)).filter(Boolean) as string[];
  return [...new Set(codes)];
}

/**
 * Egy Jobicy hirdetés → közös Job séma.
 * Exportált, mert a test/jobicy.test.ts a mentett fixture-ön ellenőrzi.
 */
export function toJob(j: JobicyJob): Job {
  const countries = geoCountries(j.jobGeo);

  return mk({
    sourceId: "jobicy",
    raw: j,
    externalId: String(j.id),
    title: String(j.jobTitle ?? ""),
    company: String(j.companyName ?? ""),
    url: j.url ?? "",
    location: j.jobGeo || undefined,
    country: countries[0],
    alsoCountries: countries.length > 1 ? countries.slice(1) : undefined,
    // Ez remote board: minden hirdetése távmunka.
    remote: true,
    description: stripHtml(j.jobDescription ?? j.jobExcerpt),
    salaryMin: num(j.salaryMin),
    salaryMax: num(j.salaryMax),
    currency: j.salaryCurrency,
    salaryPeriod: toSalaryPeriod(j.salaryPeriod),
    seniority: j.jobLevel || undefined,
    // A jobType TÖMB — az elsőt vesszük típusnak, a többi tagként megy.
    employmentType: j.jobType?.[0],
    postedAt: toISO(j.pubDate),
    tags: [...(j.jobIndustry ?? []), ...(j.jobType ?? []).slice(1)].map(String),
  });
}

interface GeoTaxonomy {
  locations?: { geoID: number; geoName: string; geoSlug: string }[];
}
interface IndustryTaxonomy {
  industries?: {
    industryID: number;
    industryName: string;
    industrySlug: string;
  }[];
}

/**
 * Taxonómia: az érvényes geo- és industry-értékek.
 *
 * Egyszer kérjük le, aztán cache-ből. A Jobicy az ismeretlen szűrőértéket
 * csendben átírja (az `industry=dev` az appliedFilters-ben `engineering`
 * lett) — ezért érdemes a valódi slugokat ismerni, nem tippelni.
 */
export async function loadTaxonomy(signal: AbortSignal) {
  const cachedGeo = getCached<string[]>(GEO_KEY);
  const cachedInd = getCached<string[]>(INDUSTRY_KEY);
  if (cachedGeo && cachedInd) return { geos: cachedGeo, industries: cachedInd };

  const [geo, ind] = await Promise.all([
    getJson<GeoTaxonomy>(`${API}?get=locations`, {
      signal,
      timeoutMs: TIMEOUT,
      retries: 0,
    }),
    getJson<IndustryTaxonomy>(`${API}?get=industries`, {
      signal,
      timeoutMs: TIMEOUT,
      retries: 0,
    }),
  ]);

  return {
    geos: setCached(
      GEO_KEY,
      (geo.locations ?? []).map((g) => g.geoSlug),
      TAXONOMY_TTL_MINUTES,
    ),
    industries: setCached(
      INDUSTRY_KEY,
      (ind.industries ?? []).map((i) => i.industrySlug),
      TAXONOMY_TTL_MINUTES,
    ),
  };
}

export const jobicy = defineSource({
  meta: {
    id: "jobicy",
    name: "Jobicy",
    category: "remote",
    auth: "none",
    regionCodes: ["global"],
    rateLimit: null,
    cacheTtlMinutes: JOBS_TTL_MINUTES,
    regions: "Globális remote",
    docs: "https://github.com/Jobicy/remote-jobs-api",
    warning:
      "Fair use. A hirdetések továbbadása versenyző aggregátoroknak tilos. 60 perces cache, lastUpdate alapú invalidálással.",
  },
  async fetch(_params, signal) {
    // 1. Friss cache → nincs hálózati hívás.
    const cached = getCached<Job[]>(JOBS_KEY);
    if (cached) return cached;

    // A taxonómia nem kell a leképezéshez, de a hibás szűrőértékek
    // felderítéséhez igen — és úgyis csak naponta egyszer megy ki.
    await loadTaxonomy(signal).catch(() => undefined);

    const data = await getJson<JobicyResponse>(`${API}?count=${COUNT}`, {
      signal,
      timeoutMs: TIMEOUT,
    });

    // 2. Lejárt cache, de a forrás bélyege UGYANAZ → az adat nem változott,
    //    felesleges újra feldolgozni. Csak meghosszabbítjuk.
    const stamp = data.lastUpdate;
    if (stamp && getStamp(JOBS_KEY) === stamp) {
      const kept = touchCached<Job[]>(JOBS_KEY, JOBS_TTL_MINUTES);
      if (kept) return kept;
    }

    const jobs = (data.jobs ?? []).map(toJob);
    return setCached(JOBS_KEY, jobs, JOBS_TTL_MINUTES, stamp);
  },
});
