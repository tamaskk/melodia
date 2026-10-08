/**
 * Ashby Job Board API — publikus, kulcs nélküli, lapozás nélkül.
 * https://developers.ashbyhq.com/docs/job-board-api
 *
 * A friss AI- és startup-cégek ATS-e, és az egész mezőny leggazdagabb
 * lokáció-objektuma: strukturált cím, külön `isRemote` és `workplaceType`,
 * plusz `secondaryLocations`. HTML ÉS plain text leírást is ad — nem kell
 * HTML-t parse-olni.
 *
 * FIZETÉS. Az `includeCompensation=true` élőben ellenőrizve működik: a ramp
 * 137 hirdetéséből 132-n van fizetéssáv. Ez messze a legjobb fizetésforrásunk.
 * A `shouldDisplayCompensationOnJobPostings: false` a cég döntése, hogy ne
 * mutassuk — tiszteletben tartjuk.
 */
import { getJson, mapLimit } from "../http";
import { guessCountry, looksRemote, num, stripHtml } from "../normalize";
import { COMPANIES } from "../companies";
import { defineSource, makeJob as mk } from "./base";
import type { Job, SalaryPeriod } from "../types";

const CONCURRENCY = 5;
const TIMEOUT = 12000;
const API = "https://api.ashbyhq.com/posting-api/job-board";

interface AshbyAddress {
  postalAddress?: {
    /** NEM ISO-2: "USA", "Germany", "United Kingdom" — normalizálni kell. */
    addressCountry?: string;
    addressRegion?: string;
    addressLocality?: string;
  };
}

interface AshbySecondaryLocation {
  location?: string;
  address?: AshbyAddress;
}

interface AshbyComponent {
  compensationType?:
    "Salary" | "EquityPercentage" | "EquityCashValue" | "Commission" | "Bonus";
  /** "1 YEAR" | "1 MONTH" | "NONE" */
  interval?: string;
  currencyCode?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
}

export interface AshbyJob {
  id: string;
  title: string;
  department?: string;
  team?: string;
  /** FullTime | PartTime | Intern | Contract | Temporary */
  employmentType?: string;
  location?: string;
  secondaryLocations?: AshbySecondaryLocation[];
  publishedAt?: string;
  /** false = létezik, de nincs publikusan meghirdetve. Ki kell szűrni. */
  isListed?: boolean;
  isRemote?: boolean;
  /** Remote | Hybrid | OnSite */
  workplaceType?: string;
  address?: AshbyAddress;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  /** Készen kapott plain text — ezt használjuk, nem parse-olunk HTML-t. */
  descriptionPlain?: string;
  shouldDisplayCompensationOnJobPostings?: boolean;
  compensation?: {
    compensationTiers?: { components?: AshbyComponent[] }[];
  };
}

/** "1 YEAR" → 'year'. Amit a séma nem ismer, az maradjon üres. */
function toSalaryPeriod(interval?: string): SalaryPeriod | undefined {
  const i = (interval ?? "").toUpperCase();
  if (i.includes("YEAR")) return "year";
  if (i.includes("MONTH")) return "month";
  if (i.includes("HOUR")) return "hour";
  return undefined;
}

/**
 * Az első Salary komponens a fizetéssáv. Az EquityPercentage, Bonus és
 * Commission komponensek szándékosan kimaradnak: azok nem alapbér, és
 * összekeverve értelmetlen számot adnának.
 */
function pickSalary(j: AshbyJob) {
  if (j.shouldDisplayCompensationOnJobPostings === false) return undefined;
  for (const tier of j.compensation?.compensationTiers ?? []) {
    for (const c of tier.components ?? []) {
      if (c.compensationType === "Salary" && c.minValue != null) return c;
    }
  }
  return undefined;
}

/** Egy lokáció-objektumból ország. Az `addressCountry` szabadszöveg, nem ISO-2. */
function countryOf(
  location?: string,
  address?: AshbyAddress,
): string | undefined {
  const raw = address?.postalAddress?.addressCountry;
  if (raw) {
    // A kétbetűs érték már ISO-2; a "USA"/"Germany" alakot normalizálni kell.
    if (raw.length === 2) return raw.toUpperCase();
    const guess = guessCountry(raw);
    if (guess) return guess;
  }
  return guessCountry(location);
}

/**
 * Egy Ashby hirdetés → közös Job séma.
 * Exportált, mert a test/ashby.test.ts a mentett fixture-ön ellenőrzi.
 */
export function toJob(company: string, j: AshbyJob): Job {
  const secondary = j.secondaryLocations ?? [];
  const primaryCountry = countryOf(j.location, j.address);

  // A másodlagos lokációk országai. A valódi EU-lehetőség gyakran itt van,
  // miközben a fő lokáció amerikai — az országszűrő ezeket is nézi.
  const alsoCountries = [
    ...new Set(
      secondary
        .map((s) => countryOf(s.location, s.address))
        .filter((c): c is string => Boolean(c) && c !== primaryCountry),
    ),
  ];

  const locationText = [j.location, ...secondary.map((s) => s.location)]
    .filter(Boolean)
    .join(" · ");

  const salary = pickSalary(j);

  return mk({
    sourceId: "ashby",
    raw: j,
    externalId: j.id,
    title: j.title,
    company,
    url: j.applyUrl ?? j.jobUrl ?? "",
    location: locationText || undefined,
    country: primaryCountry,
    alsoCountries: alsoCountries.length ? alsoCountries : undefined,
    // Az isRemote és a workplaceType együtt; szöveg-fallback csak ha egyik sincs.
    remote:
      j.isRemote === true ||
      j.workplaceType === "Remote" ||
      (j.isRemote == null &&
        !j.workplaceType &&
        looksRemote(locationText, j.title)),
    // A descriptionPlain készen van — a HTML csak tartalék.
    description: j.descriptionPlain ?? stripHtml(j.descriptionHtml),
    employmentType: j.employmentType,
    salaryMin: num(salary?.minValue),
    salaryMax: num(salary?.maxValue),
    currency: salary?.currencyCode ?? undefined,
    salaryPeriod: toSalaryPeriod(salary?.interval),
    postedAt: j.publishedAt,
    tags: [j.department, j.team].filter(Boolean) as string[],
  });
}

export const ashby = defineSource({
  meta: {
    id: "ashby",
    name: "Ashby",
    category: "ats",
    auth: "none",
    regionCodes: ["global"],
    rateLimit: null,
    cacheTtlMinutes: 720,
    regions: "Startupok és AI-cégek, globális",
    docs: "https://developers.ashbyhq.com/docs/job-board-api",
  },
  async fetch(_params, signal) {
    return mapLimit(COMPANIES.ashby, CONCURRENCY, async (name) => {
      const data = await getJson<{ jobs?: AshbyJob[] }>(
        `${API}/${name}?includeCompensation=true`,
        { signal, timeoutMs: TIMEOUT },
      );
      return (
        (data.jobs ?? [])
          // isListed:false = létezik, de nincs publikusan meghirdetve. Ha nem
          // szűrnénk, olyan pozíciókra jelentkeznénk, amik nem is nyitottak.
          .filter((j) => j.isListed !== false)
          .map((j) => toJob(name, j))
      );
    });
  },
});
