/**
 * JobAssist API — típusok és leképezés.
 *
 * A VÁLASZ ALAKJA ÉLŐBEN ELLENŐRIZVE (2026-09-07). A tényleges mezőnevek:
 *   jobTitle, companyName, companyWebsite (domain), companyLogo, location,
 *   country, isRemote, workType (remote/hybrid/onsite),
 *   workArrangement (full-time/part-time — a névvel ELLENTÉTBEN nem a remote!),
 *   salaryMin/Max (float), salaryCurrency, salaryUnit (YEAR/…), jobUrl,
 *   postedAt, description (plain text), matchScore, matchReasons, source.
 *
 * A leképezés TŰRŐ maradt (több névalternatíva), hogy egy jövőbeli
 * séma-változás ne törje el a kártyát. A `?debug=1` a nyers választ adja.
 */

import { formatNumber } from "../../format";

/** A JobAssist nyers eleme — ismeretlen alak, ezért laza. */
export type RawJob = Record<string, unknown>;

/** Amit a kártya megjelenít. */
export interface JobAssistJob {
  id: string;
  title: string;
  company?: string;
  companyLogo?: string;
  location?: string;
  remote?: boolean;
  url?: string;
  description?: string;
  salary?: string;
  employmentType?: string;
  seniority?: string;
  postedAt?: string;
  tags: string[];
  /** A forrás relevancia-pontszáma, ha ad ilyet (sortBy=best-match). */
  matchScore?: number;
  raw: RawJob;
}

export interface JobAssistPage {
  jobs: JobAssistJob[];
  total?: number;
  /** Cursor-alapú lapozáshoz. */
  nextCursor?: string;
  /** Oldalszám-alapú lapozáshoz. */
  page?: number;
  hasMore?: boolean;
}

/* ------------------------------------------------------------ segédek */

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

/** Az első nem üres érték a felsorolt kulcsok közül (pont-jelöléssel is). */
export function pick(obj: RawJob, ...keys: string[]): string | undefined {
  for (const key of keys) {
    let cur: unknown = obj;
    for (const part of key.split(".")) {
      if (cur == null || typeof cur !== "object") {
        cur = undefined;
        break;
      }
      cur = (cur as Record<string, unknown>)[part];
    }
    const s = str(cur);
    if (s) return s;
  }
  return undefined;
}

function pickNumber(obj: RawJob, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const v = pick(obj, key);
    if (v == null) continue;
    const n = Number(v);
    if (isFinite(n)) return n;
  }
  return undefined;
}

function pickBool(obj: RawJob, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const v = pick(obj, key);
    if (v == null) continue;
    if (/^(true|1|yes|remote)$/i.test(v)) return true;
    if (/^(false|0|no)$/i.test(v)) return false;
  }
  return undefined;
}

/** Tömbként értelmezhető mező → stringek. */
export function pickList(obj: RawJob, ...keys: string[]): string[] {
  for (const key of keys) {
    const v = (obj as Record<string, unknown>)[key];
    if (Array.isArray(v)) {
      const out = v
        .map((x) =>
          typeof x === "string"
            ? x
            : str((x as RawJob)?.name ?? (x as RawJob)?.label),
        )
        .filter((x): x is string => Boolean(x));
      if (out.length) return out;
    }
    if (typeof v === "string" && v.includes(",")) {
      return v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

/** Fizetés emberi alakra hozva, akárhogy is adja a forrás. */
export function formatSalary(j: RawJob): string | undefined {
  const text = pick(j, "salary", "salaryText", "compensation", "salary_range");
  if (text) return text;

  const min = pickNumber(
    j,
    "salaryMin",
    "salary_min",
    "minSalary",
    "salary.min",
  );
  const max = pickNumber(
    j,
    "salaryMax",
    "salary_max",
    "maxSalary",
    "salary.max",
  );
  if (!min && !max) return undefined;

  const cur =
    pick(
      j,
      "salaryCurrency",
      "currency",
      "salary_currency",
      "salary.currency",
    ) ?? "";
  // A salaryUnit "YEAR"/"MONTH"/"HOUR" — emberi alakra hozzuk.
  const unitRaw = pick(
    j,
    "salaryUnit",
    "salaryPeriod",
    "salary_period",
    "period",
    "salary.period",
  );
  const unit = unitRaw
    ? ({
        year: "/év",
        month: "/hó",
        hour: "/óra",
        yearly: "/év",
        monthly: "/hó",
        hourly: "/óra",
      }[unitRaw.toLowerCase()] ?? `/${unitRaw.toLowerCase()}`)
    : "";
  // A salaryMin float lehet (54473.80859375) — kerekítjük.
  const fmt = (n: number) => formatNumber(Math.round(n));
  const range = min && max ? `${fmt(min)}–${fmt(max)}` : fmt((min ?? max)!);
  // Ugyanaz az alak, mint a kereső kártyáin: „75 000–95 000 EUR/év".
  return `${range} ${cur}${unit}`.replace(/\s+/g, " ").trim();
}

/**
 * Egy nyers JobAssist elem → kártya-modell.
 *
 * Minden mezőnél több lehetséges nevet próbálunk, mert a válasz alakja nem
 * ellenőrzött. Ami nincs meg, az kimarad — a kártya attól még megjelenik.
 */
export function toJobAssistJob(raw: RawJob): JobAssistJob {
  // A JobAssist a `location`-t ("Remote", "Berlin") és a `country`-t ("CA")
  // külön adja — ha a location nem mondja meg az országot, hozzáfűzzük.
  const locPrimary = pick(
    raw,
    "location",
    "locationText",
    "city",
    "location.name",
    "location.display_name",
  );
  const country = pick(raw, "country", "location.country");
  const location =
    locPrimary && country && !locPrimary.includes(country)
      ? `${locPrimary} · ${country}`
      : (locPrimary ??
        ([pick(raw, "location.city", "city"), country]
          .filter(Boolean)
          .join(", ") ||
          undefined));

  return {
    id:
      pick(raw, "id", "externalId", "_id", "jobId", "uuid", "slug", "url") ??
      Math.random().toString(36).slice(2),
    title:
      pick(raw, "jobTitle", "title", "name", "position", "occupation") ??
      "(nincs cím)",
    company: pick(
      raw,
      "companyName",
      "company",
      "company.name",
      "employer",
      "company_name",
    ),
    companyLogo: pick(
      raw,
      "companyLogo",
      "logo",
      "company.logo",
      "companyLogoUrl",
      "company_logo",
    ),
    location,
    // A JobAssitnál a `workType` a remote/hybrid, NEM a `workArrangement`
    // (az a full-time/part-time). A név megtévesztő — ezért mérve kötöttük be.
    remote:
      pickBool(raw, "isRemote", "remote", "is_remote") ??
      /remote/i.test(
        pick(raw, "workType", "workplaceType", "remotePolicy") ?? "",
      ),
    url: pick(
      raw,
      "jobUrl",
      "url",
      "applyUrl",
      "applicationUrl",
      "link",
      "apply_url",
    ),
    description: pick(
      raw,
      "description",
      "summary",
      "snippet",
      "excerpt",
      "jobDescription",
    ),
    salary: formatSalary(raw),
    // workArrangement = full-time/part-time (a JobAssist elnevezése fordított).
    employmentType: pick(
      raw,
      "workArrangement",
      "employmentType",
      "jobType",
      "type",
      "employment_type",
    ),
    seniority: pick(
      raw,
      "seniority",
      "level",
      "experienceLevel",
      "experience_level",
    ),
    postedAt: pick(
      raw,
      "postedAt",
      "publishedAt",
      "createdAt",
      "datePosted",
      "posted_at",
      "date",
    ),
    tags: [
      ...pickList(raw, "tags", "skills", "keywords", "technologies", "stack"),
      ...pickList(raw, "categories", "category"),
    ].slice(0, 8),
    matchScore: pickNumber(
      raw,
      "matchScore",
      "score",
      "relevance",
      "relevanceScore",
    ),
    raw,
  };
}

/**
 * A válasz burkolójából a lista + lapozási adatok.
 * A lista kulcsa lehet `jobs`, `data`, `results`, `items` — vagy maga a gyökér tömb.
 */
export function toPage(data: unknown): JobAssistPage {
  if (Array.isArray(data)) {
    return { jobs: (data as RawJob[]).map(toJobAssistJob) };
  }
  const obj = (data ?? {}) as Record<string, unknown>;

  let list: RawJob[] = [];
  for (const key of ["jobs", "data", "results", "items", "hits", "content"]) {
    const v = obj[key];
    if (Array.isArray(v)) {
      list = v as RawJob[];
      break;
    }
  }
  // Ha egyik ismert kulcs sem stimmel: az ELSŐ tömb értékű mező.
  if (!list.length) {
    const found = Object.values(obj).find((v) => Array.isArray(v));
    if (Array.isArray(found)) list = found as RawJob[];
  }

  const meta = (obj.pagination ?? obj.meta ?? obj) as Record<string, unknown>;
  const page = Number(meta.page ?? obj.page) || undefined;
  const totalPages = Number(meta.totalPages ?? meta.total_pages) || undefined;
  return {
    jobs: list.map(toJobAssistJob),
    total:
      Number(meta.total ?? meta.totalCount ?? meta.count ?? obj.total) ||
      undefined,
    nextCursor: (obj.nextCursor ?? meta.nextCursor ?? meta.cursor) as
      string | undefined,
    page,
    // Oldalszám-lapozásnál a totalPages mondja meg, van-e még.
    hasMore:
      Boolean(obj.nextCursor) ||
      (page != null && totalPages != null && page < totalPages),
  };
}
