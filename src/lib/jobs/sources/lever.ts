/**
 * Lever Postings API — publikus, kulcs nélküli, pontosan erre a célra készült.
 * https://github.com/lever/postings-api
 *
 * A Greenhouse párja: sok közepes cég és scale-up használja, EU-ban különösen
 * a francia scale-upok. Ez az egyetlen ATS-forrásunk, ami fizetéssávot is ad,
 * ha a cég feltöltötte — ritka és értékes.
 *
 * LAPOZÁS. A `limit` felső korlátja 100, és a szerver csendben csonkol: a
 * palantir boardján 309 hirdetés van, `limit=100`-zal ebből 100 látszik.
 * Ezért `skip`-pel végiglapozunk, amíg teli oldal jön.
 */
import { getJson, mapLimit } from "../http";
import { guessCountry, looksRemote, num, stripHtml, toISO } from "../normalize";
import { COMPANIES } from "../companies";
import { defineSource, makeJob as mk } from "./base";
import type { Job, SalaryPeriod } from "../types";

const CONCURRENCY = 5;
const TIMEOUT = 12000;

/** A Lever felső korlátja egy oldalra. Ennél nagyobb `limit` sem ad többet. */
const PAGE_SIZE = 100;

/**
 * Hány oldalt kérünk le legfeljebb CÉGENKÉNT. 5 × 100 = 500 hirdetés; ennél
 * nagyobb boardot nem láttunk, és a 25 s-os globális timeout is korlát.
 */
const MAX_PAGES = 5;

const API = "https://api.lever.co/v0/postings";

export interface LeverJob {
  id: string;
  /** A CÍM MEZŐJE `text`, nem `title`. Ez a leggyakoribb hiba Lever-integrációkban. */
  text: string;
  /** Epoch MILLISZEKUNDUM, nem másodperc. */
  createdAt?: number;
  hostedUrl: string;
  applyUrl?: string;
  /** ISO-2, ha a cég megadta. */
  country?: string;
  workplaceType?: "onsite" | "remote" | "hybrid";
  /** Már tisztított szöveg — ezt használjuk a HTML `description` helyett. */
  descriptionPlain?: string;
  description?: string;
  categories?: {
    location?: string;
    allLocations?: string[];
    team?: string;
    department?: string;
    commitment?: string;
  };
  salaryRange?: {
    min?: number;
    max?: number;
    currency?: string;
    interval?: string;
  };
  salaryDescription?: string;
}

/**
 * A Lever `interval` értékei → a közös séma `salaryPeriod`-ja.
 * Amit a séma nem ismer (heti, napi, egyszeri), az inkább maradjon üres,
 * mint hogy hamis évesnek látsszon.
 */
function toSalaryPeriod(interval?: string): SalaryPeriod | undefined {
  switch (interval) {
    case "per-year-salary":
      return "year";
    case "per-month-salary":
      return "month";
    case "per-hour-wage":
      return "hour";
    default:
      return undefined;
  }
}

/**
 * Egy Lever posting → közös Job séma.
 * Exportált, mert a test/lever.test.ts a mentett fixture-ön ellenőrzi.
 */
export function toJob(company: string, j: LeverJob): Job {
  // A `location` egyetlen string, az `allLocations` a teljes kép több helyszínnél.
  const all = j.categories?.allLocations;
  const location = all?.length ? all.join(" · ") : j.categories?.location;

  return mk({
    sourceId: "lever",
    raw: j,
    externalId: j.id,
    title: j.text,
    company,
    url: j.applyUrl ?? j.hostedUrl,
    location,
    country: j.country?.toUpperCase() ?? guessCountry(location),
    // A workplaceType közvetlenül képezhető; ha hiányzik, a szövegre esünk vissza.
    remote:
      j.workplaceType === "remote" ||
      (!j.workplaceType && looksRemote(location, j.text)),
    description: j.descriptionPlain ?? stripHtml(j.description),
    employmentType: j.categories?.commitment,
    salaryMin: num(j.salaryRange?.min),
    salaryMax: num(j.salaryRange?.max),
    currency: j.salaryRange?.currency,
    salaryPeriod: toSalaryPeriod(j.salaryRange?.interval),
    postedAt: toISO(j.createdAt),
    tags: [j.categories?.team, j.categories?.department].filter(
      Boolean,
    ) as string[],
  });
}

/** Egy cég összes hirdetése, végiglapozva. */
async function fetchCompany(
  company: string,
  signal: AbortSignal,
): Promise<Job[]> {
  const jobs: Job[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      // A mode=json KÖTELEZŐ — nélküle HTML-t ad vissza, nem JSON-t.
      mode: "json",
      limit: String(PAGE_SIZE),
      skip: String(page * PAGE_SIZE),
    });
    const data = await getJson<LeverJob[]>(`${API}/${company}?${params}`, {
      signal,
      timeoutMs: TIMEOUT,
    });
    const batch = Array.isArray(data) ? data : [];
    jobs.push(...batch.map((j) => toJob(company, j)));

    // Nem teli oldal = elfogyott. Így egy fölösleges hívást se teszünk.
    if (batch.length < PAGE_SIZE) break;
  }

  return jobs;
}

export const lever = defineSource({
  meta: {
    id: "lever",
    name: "Lever",
    category: "ats",
    auth: "none",
    regionCodes: ["global"],
    rateLimit: null,
    cacheTtlMinutes: 720,
    regions: "US + EU (FR-túlsúly)",
    docs: "https://github.com/lever/postings-api",
  },
  async fetch(_params, signal) {
    // Halott slug 404-et ad {"ok":false,"error":"Document not found"} törzzsel;
    // a mapLimit egyenként elnyeli, és csak akkor dob, ha MIND elbukik.
    return mapLimit(COMPANIES.lever, CONCURRENCY, (company) =>
      fetchCompany(company, signal),
    );
  },
});
