/**
 * 4dayweek.io — REFERENCIA-ADAPTER.
 * https://4dayweek.io/developers
 *
 * A legjobban dokumentált ingyenes forrás a listán: publikált rate limit,
 * valódi lapozás (`has_more` + `total`), beágyazott cégobjektum, strukturált
 * készséglisták. Új adapter írásakor ezt érdemes mintának venni.
 *
 * AMIT ÉLŐBEN MÉRTEM (2026-09-01), és amit a doksi nem mond el:
 *
 *   • `posted_after` CSENDBEN NEM SZŰR. A `total` vele és nélküle is 24216,
 *     és a lap legrégebbi eleme ugyanaz. Ezért az inkrementális szűrést
 *     KLIENSOLDALON végezzük — a paramétert azért küldjük, mert ártalmatlan
 *     és egyszer még működhet.
 *   • `country=Hungary` szűr (24216 → 223), de KÖRNYÉKRE: Szerbia, Románia,
 *     Horvátország, Bulgária is jön. Nem pontos országszűrő.
 *   • `limit=150` csendben 100-ra vágódik — a doksi felső korlátja igaz.
 *   • A `skills`, `stack`, `tools` mezők OBJEKTUMTÖMBÖK (`{name, slug}`),
 *     nem stringek. Aki `String()`-gel képezi őket, "[object Object]"-et kap.
 *   • Rate limit fejlécek jönnek: `x-ratelimit-limit: 60`,
 *     `x-ratelimit-remaining`. A 60/perc valós, HTTP 429-cel.
 */
import { jobsEnv } from "../env";
import { getJson, sleep } from "../http";
import { guessCountry, num, stripHtml, toISO } from "../normalize";
import { defineSource, makeJob as mk } from "./base";
import type { Job, SalaryPeriod } from "../types";

const API = "https://4dayweek.io/api/v2/jobs";
const TIMEOUT = 15000;

/** A doksi felső korlátja; a 150 csendben 100-ra vágódik. */
const PAGE_SIZE = 100;

/** Hány oldalt kérünk le legfeljebb. 3 × 100 = 300 hirdetés keresésenként. */
const MAX_PAGES = 3;

/**
 * Két kérés között ennyit várunk.
 *
 * A publikált limit 60/perc, tehát 1000 ms elvileg elég — az 1100 a
 * biztonsági ráhagyás. Az edge-cache amúgy is 60 mp, tehát a gyorsabb
 * pörgetés nem is adna frissebb adatot.
 */
const THROTTLE_MS = 1100;

/** Inkrementális futás: ennyi napra visszamenőleg tartjuk meg a hirdetéseket. */
const POSTED_AFTER_DAYS = Number(
  jobsEnv("FOURDAYWEEK_POSTED_AFTER_DAYS") ?? 30,
);

interface Named {
  name?: string;
  slug?: string;
}

interface FdwLocation {
  city?: string;
  state?: string;
  /** Szabadszöveg: "United Kingdom", nem "GB". */
  country?: string;
  continent?: string;
  work_arrangement?: string;
  /** Több lokáció közül ez a fő. */
  is_primary?: boolean;
}

interface FdwCompany {
  name?: string;
  slug?: string;
  url?: string;
  /** A CÉGES DOMAIN. Ez az egyetlen forrás, ami közvetlenül megadja. */
  website?: string;
  country?: string;
  employees?: string | number;
  short_description?: string;
}

export interface FdwJob {
  id?: string | number;
  slug?: string;
  title?: string;
  description?: string;
  url?: string;
  category?: string;
  role?: string;
  level?: string;
  contract_type?: string;
  schedule_type?: string;
  hours_per_week_min?: number;
  hours_per_week_max?: number;
  /** "remote" | "hybrid" | "onsite" */
  work_arrangement?: string;
  locations?: FdwLocation[];
  /** OBJEKTUMTÖMBÖK, nem stringek. */
  skills?: Named[];
  stack?: Named[];
  tools?: Named[];
  posted_at?: string;
  expires_at?: string | null;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  salary_period?: string;
  company?: FdwCompany;
}

interface FdwResponse {
  data?: FdwJob[];
  page?: number;
  limit?: number;
  total?: number;
  has_more?: boolean;
}

/** URL-ből puszta domain. A Hunter.io-lépés ezt várja. */
export function toDomain(website?: string): string | undefined {
  if (!website) return undefined;
  const host = website
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./i, "")
    .trim()
    .toLowerCase();
  return host || undefined;
}

/** A `{name, slug}` objektumtömbökből nevek. Ez a forrás fő csapdája. */
export function namesOf(...lists: (Named[] | undefined)[]): string[] {
  const names = lists
    .flatMap((l) => l ?? [])
    .map((n) => (typeof n === "string" ? n : n?.name))
    .filter((n): n is string => Boolean(n));
  return [...new Set(names)];
}

/**
 * Cégnév kinyerése a hirdetés URL-jéből, ha a `company` objektum hiányzik.
 *
 * Élőben 300-ból 3 rekordon a `company` egyszerűen `undefined` — a cég viszont
 * ott van az URL-ben: `/job/<cím>-at-<cég>-<hash>`. Az UTOLSÓ "-at-" a
 * határ (a cím maga is tartalmazhat "at"-ot), a záró hex hash pedig lekerül.
 * Inkább nyers slug, mint elveszett hirdetés.
 */
export function companyFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const slug = url.split("/").pop() ?? "";
  const at = slug.lastIndexOf("-at-");
  if (at < 0) return undefined;
  const tail = slug.slice(at + 4).replace(/-[0-9a-f]{6,}$/i, "");
  if (!tail) return undefined;
  return tail.split("-").filter(Boolean).join(" ");
}

/** Több lokáció közül az `is_primary`; ha nincs megjelölve, az első. */
export function primaryLocation(
  locations?: FdwLocation[],
): FdwLocation | undefined {
  if (!locations?.length) return undefined;
  return locations.find((l) => l.is_primary) ?? locations[0];
}

export function toSalaryPeriod(period?: string): SalaryPeriod | undefined {
  const p = (period ?? "").toLowerCase();
  if (p.startsWith("year") || p === "annual" || p === "annually") return "year";
  if (p.startsWith("month")) return "month";
  if (p.startsWith("hour")) return "hour";
  return undefined;
}

/**
 * Egy 4dayweek hirdetés → közös Job séma.
 * Exportált, mert a test/fourdayweek.test.ts a mentett fixture-ön ellenőrzi.
 */
export function toJob(j: FdwJob): Job {
  const primary = primaryLocation(j.locations);
  const location = [primary?.city, primary?.state, primary?.country]
    .filter(Boolean)
    .join(", ");

  // A további lokációk országai — ugyanaz a pozíció máshol is nyitva lehet.
  const primaryCountry = guessCountry(primary?.country ?? primary?.city);
  const alsoCountries = [
    ...new Set(
      (j.locations ?? [])
        .filter((l) => l !== primary)
        .map((l) => guessCountry(l.country ?? l.city))
        .filter((c): c is string => Boolean(c) && c !== primaryCountry),
    ),
  ];

  return mk({
    sourceId: "fourdayweek",
    raw: j,
    externalId: String(j.id ?? j.slug ?? ""),
    title: String(j.title ?? ""),
    // Néhány hirdetésen a company objektum teljesen hiányzik (élőben 3/300).
    // Sorrend: név → slug → az URL-ből visszafejtett cégnév.
    company: String(
      j.company?.name ?? j.company?.slug ?? companyFromUrl(j.url) ?? "",
    ),
    // A céges domain közvetlenül a válaszból — ez a forrás legnagyobb értéke.
    companyDomain: toDomain(j.company?.website),
    url: j.url ?? "",
    location: location || undefined,
    country: primaryCountry ?? guessCountry(j.company?.country),
    alsoCountries: alsoCountries.length ? alsoCountries : undefined,
    // A work_arrangement strukturált mező — nem kell szövegből következtetni.
    remote:
      j.work_arrangement === "remote" || primary?.work_arrangement === "remote",
    description: stripHtml(j.description),
    salaryMin: num(j.salary_min),
    salaryMax: num(j.salary_max),
    currency: j.salary_currency,
    salaryPeriod: toSalaryPeriod(j.salary_period),
    seniority: j.level,
    employmentType: j.contract_type ?? j.schedule_type,
    // Ez a forrás csökkentett munkaidős állásokra szakosodott — az óraszám
    // itt nem mellékes adat, hanem a lényeg.
    minHours: num(j.hours_per_week_min),
    maxHours: num(j.hours_per_week_max),
    postedAt: toISO(j.posted_at),
    expiresAt: toISO(j.expires_at),
    // skills + stack + tools egyben: kész input a scoringhoz, nem kell a
    // leírásból kinyerni.
    tags: [j.category, j.role, ...namesOf(j.skills, j.stack, j.tools)]
      .filter(Boolean)
      .slice(0, 20) as string[],
  });
}

export const fourdayweek = defineSource({
  meta: {
    id: "fourdayweek",
    name: "4dayweek.io",
    category: "remote",
    auth: "none",
    regionCodes: ["global"],
    rateLimit: { perMinute: 60 },
    // Az edge-cache 60 mp; ennél sűrűbben úgysem kapnánk friss adatot.
    cacheTtlMinutes: 360,
    regions: "Globális, csökkentett munkaidő",
    docs: "https://4dayweek.io/developers",
    warning:
      "60 kérés/perc, HTTP 429-cel. A posted_after paramétert a szerver figyelmen kívül hagyja — kliensoldalon szűrünk. Ez az egyetlen forrás, ami céges domaint ad.",
  },
  async fetch(params, signal) {
    const since = new Date(Date.now() - POSTED_AFTER_DAYS * 86400_000);
    const sinceIso = since.toISOString().slice(0, 10);
    const jobs: Job[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const qs = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        // A szerver jelenleg figyelmen kívül hagyja, de ártalmatlan, és ha
        // egyszer működni kezd, azonnal kevesebb adatot kell átvinnünk.
        posted_after: sinceIso,
      });
      if (params.q) qs.set("q", params.q);

      const data = await getJson<FdwResponse>(`${API}?${qs}`, {
        signal,
        timeoutMs: TIMEOUT,
        // A 429-et és az 5xx-et a közös http.ts kezeli exponenciális
        // backoff-fal (600 / 1200 / 2400 ms).
        retries: 2,
      });

      jobs.push(...(data.data ?? []).map(toJob));

      if (!data.has_more || !(data.data ?? []).length) break;
      // Throttle a 60/perc limithez. Az utolsó oldal után nem várunk.
      if (page < MAX_PAGES) await sleep(THROTTLE_MS);
    }

    // Inkrementális szűrés kliensoldalon, mert a posted_after nem hat.
    const cutoff = since.toISOString();
    return jobs.filter((j) => !j.postedAt || j.postedAt >= cutoff);
  },
});
