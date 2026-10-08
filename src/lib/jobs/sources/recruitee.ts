/**
 * Recruitee API — publikus, kulcs nélküli, lapozás nélkül.
 * https://docs.recruitee.com/reference/offers-list
 *
 * Holland eredetű ATS, a Benelux kkv- és scale-up-szegmensének fő rendszere —
 * ez az NL célország legjobb forrása. Az egész ATS-mezőny legrészletesebb
 * válasza: strukturált fizetés PERIÓDUSSAL, heti óraszám, és három külön
 * bool a munkavégzés helyére.
 */
import { getJson, mapLimit } from "../http";
import { guessCountry, num, stripHtml } from "../normalize";
import { COMPANIES } from "../companies";
import { defineSource, makeJob as mk } from "./base";
import type { Job, SalaryPeriod } from "../types";

const CONCURRENCY = 5;
const TIMEOUT = 12000;

interface RecruiteeTranslation {
  title?: string;
  description?: string;
  requirements?: string;
}

export interface RecruiteeOffer {
  id: number;
  title: string;
  slug?: string;
  department?: string;
  category_code?: string;
  employment_type_code?: string;
  location?: string;
  city?: string;
  state_name?: string;
  country?: string;
  /** Már ISO-2 — nem kell parser. */
  country_code?: string;
  /** A min/max stringként is jöhet ("2950"). */
  salary?: {
    min?: number | string;
    max?: number | string;
    currency?: string;
    period?: string;
  };
  description?: string;
  requirements?: string;
  /** Holland cégeknél a leírás gyakran NL — az `en` kulcs az angol fordítás. */
  translations?: Record<string, RecruiteeTranslation | undefined>;
  careers_url?: string;
  careers_apply_url?: string;
  /** Csak a 'published' számít. */
  status?: string;
  published_at?: string;
  updated_at?: string;
  /** Heti óraszám. A holland piacon a 32 órás hét gyakori. */
  min_hours?: number;
  max_hours?: number;
  /** Három KÜLÖN bool — nem zárják ki egymást, több is lehet true. */
  hybrid?: boolean;
  remote?: boolean;
  on_site?: boolean;
  experience_code?: string;
  education_code?: string;
  company_name?: string;
}

/** A Recruitee készen adja a periódust: "month" | "year" | "hour" | … */
function toSalaryPeriod(period?: string): SalaryPeriod | undefined {
  const p = (period ?? "").toLowerCase();
  if (p.includes("year") || p.includes("annual")) return "year";
  if (p.includes("month")) return "month";
  if (p.includes("hour")) return "hour";
  return undefined;
}

/**
 * Egy Recruitee ajánlat → közös Job séma.
 * Exportált, mert a test/recruitee.test.ts a mentett fixture-ön ellenőrzi.
 */
export function toJob(company: string, o: RecruiteeOffer): Job {
  // Angol fordítás, ha van: a holland leírás a scoringnak használhatatlan.
  const en = o.translations?.en;
  const description =
    stripHtml(
      [en?.description, en?.requirements].filter(Boolean).join("\n\n"),
    ) ??
    stripHtml([o.description, o.requirements].filter(Boolean).join("\n\n"));

  const location =
    o.location ??
    ([o.city, o.state_name].filter(Boolean).join(", ") || undefined);

  return mk({
    sourceId: "recruitee",
    raw: o,
    externalId: String(o.id),
    title: en?.title ?? o.title,
    company: o.company_name ?? company,
    url: o.careers_apply_url ?? o.careers_url ?? "",
    location,
    // A country_code már ISO-2; a country szabadszöveg csak tartalék.
    country:
      o.country_code?.toUpperCase() ?? guessCountry(o.country ?? location),
    // A három bool nem zárja ki egymást. A remote a szűrés alapja: csak az
    // explicit remote:true számít, a hybrid nem — az irodába járást jelent.
    remote: o.remote === true,
    description,
    salaryMin: num(o.salary?.min),
    salaryMax: num(o.salary?.max),
    currency: o.salary?.currency,
    salaryPeriod: toSalaryPeriod(o.salary?.period),
    employmentType: o.employment_type_code,
    seniority: o.experience_code,
    minHours: num(o.min_hours),
    maxHours: num(o.max_hours),
    postedAt: o.published_at ?? o.updated_at,
    tags: [o.department, o.category_code].filter(Boolean) as string[],
  });
}

export const recruitee = defineSource({
  meta: {
    id: "recruitee",
    name: "Recruitee",
    category: "ats",
    auth: "none",
    regionCodes: ["NL", "BE", "DE"],
    rateLimit: null,
    cacheTtlMinutes: 720,
    regions: "Benelux (NL-túlsúly)",
    docs: "https://docs.recruitee.com/reference/offers-list",
    warning:
      "A leírás gyakran hollandul van; ahol létezik translations.en, azt használjuk.",
  },
  async fetch(_params, signal) {
    return mapLimit(COMPANIES.recruitee, CONCURRENCY, async (company) => {
      const data = await getJson<{ offers?: RecruiteeOffer[] }>(
        `https://${company}.recruitee.com/api/offers/`,
        { signal, timeoutMs: TIMEOUT },
      );
      return (
        (data.offers ?? [])
          // Csak a publikált hirdetés — a többi nem nyitott pozíció.
          .filter((o) => !o.status || o.status === "published")
          .map((o) => toJob(company, o))
      );
    });
  },
});
