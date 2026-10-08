/**
 * Remotive — remote board, kulcs nélkül.
 * https://github.com/remotive-com/remote-jobs-api
 *
 * ⚠️ A hivatalos ajánlás NAPI 1 LEKÉRÉS. Ezért a cache TTL 24 óra, és a
 * forrás a cache-ből szolgál ki, amíg az él.
 *
 * ⚠️ ToS: kötelező forrás-visszalinkelés, és tilos a hirdetéseket versenyző
 * aggregátoroknak továbbadni. A meta.attribution ki van töltve.
 *
 * KÉT BUKTATÓ:
 *   • A gyökér mező neve `job-count` KÖTŐJELLEL — `data['job-count']`,
 *     nem `data.jobCount`. A válaszban ott van a `total-job-count` és két
 *     jogi mező is (`00-warning`, `0-legal-notice`).
 *   • A `candidate_required_location` a Himalayas `locationRestrictions`
 *     megfelelője: megmondja, HONNAN lehet dolgozni. Vesszős felsorolás,
 *     régiókkal keverve („Europe, EMEA, UK, Germany, European timezones").
 */
import { getJson } from "../http";
import { getCached, setCached } from "../cache";
import {
  eligibleCountries,
  guessCountry,
  isReachableFrom,
  stripHtml,
  toISO,
} from "../normalize";
import { parseHungarianSalary } from "../parse/hungarian-salary";
import { defineSource, makeJob as mk } from "./base";
import type { Job } from "../types";

const API = "https://remotive.com/api/remote-jobs";
const TIMEOUT = 15000;

/** A hivatalos ajánlás napi 1 lekérés — a cache ezt tartja be. */
const CACHE_TTL_MINUTES = 24 * 60;
const CACHE_KEY = "remotive:jobs";

const LIMIT = 100;

export interface RemotiveJob {
  id?: number | string;
  url?: string;
  title?: string;
  company_name?: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  /** HONNAN lehet dolgozni. Vesszős felsorolás, régiókkal keverve. */
  candidate_required_location?: string;
  /** Szabadszöveg: "$150k - $230k", "$14/hour". */
  salary?: string;
  description?: string;
}

interface RemotiveResponse {
  /** KÖTŐJELES mezőnév — data['job-count'], nem data.jobCount. */
  "job-count"?: number;
  "total-job-count"?: number;
  jobs?: RemotiveJob[];
}

/** A válasz hirdetésszáma. Külön függvény, mert a kötőjeles név könnyen elvész. */
export function jobCount(data: RemotiveResponse): number {
  return data["job-count"] ?? data.jobs?.length ?? 0;
}

/**
 * Dollár-alapú fizetésszöveg értelmezése.
 * A magyar parser a Ft-ra van kalibrálva; ez az angolszász alakokat fogja.
 */
export function parseUsdSalary(text?: string): {
  min?: number;
  max?: number;
  currency?: string;
  period?: "year" | "hour";
} {
  if (!text) return {};
  const s = text.trim();
  if (!s) return {};
  const currency = /\$|usd/i.test(s)
    ? "USD"
    : /€|eur/i.test(s)
      ? "EUR"
      : /£|gbp/i.test(s)
        ? "GBP"
        : undefined;
  const period = /\/\s*(hour|hr|h)\b|hourly/i.test(s) ? "hour" : "year";

  // "150k" → 150000; "$120 - $170 /hour" → [120, 170]
  const nums: number[] = [];
  for (const m of s.matchAll(/(\d[\d.,]*)\s*(k)?/gi)) {
    const raw = m[1].replace(/,/g, "");
    let v = Number(raw);
    if (!isFinite(v) || v <= 0) continue;
    if (m[2]) v *= 1000;
    nums.push(v);
  }
  if (!nums.length) return { currency, period };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max: max > min ? max : undefined, currency, period };
}

/**
 * Egy Remotive hirdetés → közös Job séma.
 * Exportált, mert a test/remotive.test.ts a fixture-ön ellenőrzi.
 */
export function toJob(j: RemotiveJob): Job {
  const restrictions = j.candidate_required_location ?? "";
  const countries = [
    ...new Set(
      restrictions
        .split(",")
        .map((r) => guessCountry(r.trim()))
        .filter((c): c is string => Boolean(c)),
    ),
  ];
  // A Ft-os alak is előfordulhat, de a Remotive dollárban gondolkodik.
  const salary = /ft|huf|forint/i.test(j.salary ?? "")
    ? parseHungarianSalary(j.salary)
    : parseUsdSalary(j.salary);

  return mk({
    sourceId: "remotive",
    raw: j,
    externalId: String(j.id ?? j.url ?? ""),
    title: String(j.title ?? ""),
    company: String(j.company_name ?? ""),
    url: j.url ?? "",
    location: restrictions || undefined,
    country: countries[0],
    alsoCountries: countries.length > 1 ? countries.slice(1) : undefined,
    remote: true,
    description: stripHtml(j.description),
    salaryMin: salary.min,
    salaryMax: salary.max,
    currency: salary.currency,
    salaryPeriod: salary.period,
    employmentType: j.job_type,
    postedAt: toISO(j.publication_date),
    tags: [j.category, ...(j.tags ?? [])]
      .filter(Boolean)
      .slice(0, 10) as string[],
  });
}

export const remotive = defineSource({
  meta: {
    id: "remotive",
    name: "Remotive",
    category: "remote",
    auth: "none",
    regionCodes: ["global"],
    rateLimit: { perDay: 1 },
    cacheTtlMinutes: CACHE_TTL_MINUTES,
    regions: "Globális remote",
    docs: "https://github.com/remotive-com/remote-jobs-api",
    warning:
      "Hivatalos ajánlás: NAPI 1 lekérés. Kötelező forrás-visszalinkelés; versenyző aggregátoroknak továbbadni tilos.",
    attribution: { label: "Remotive", url: "https://remotive.com" },
  },
  async fetch(_params, signal) {
    const cached = getCached<Job[]>(CACHE_KEY);
    if (cached) return cached;

    const data = await getJson<RemotiveResponse>(`${API}?limit=${LIMIT}`, {
      signal,
      timeoutMs: TIMEOUT,
    });

    const eligible = eligibleCountries();
    // Ugyanaz a szűrés, mint a Himalayasnál: amire innen nem lehet
    // jelentkezni, azt nem mutatjuk meg.
    const jobs = (data.jobs ?? [])
      .filter((j) => isReachableFrom(j.candidate_required_location, eligible))
      .map(toJob);

    return setCached(CACHE_KEY, jobs, CACHE_TTL_MINUTES);
  },
});
