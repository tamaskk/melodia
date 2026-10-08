/**
 * SmartRecruiters Posting API — nagyvállalati ATS, kulcs nélküli publikus lista.
 * https://developers.smartrecruiters.com/docs/posting-api
 *
 * Retail, gyártás, egészségügy, sok nagy EU-s munkáltatóval — és ez az
 * egyetlen ATS a listán VALÓDI, dokumentált offset/limit lapozással.
 *
 * A SÉMÁT ÉLŐBEN VALIDÁLTAM (2026-09-01), mert a doksi-alapú mezőneveket a
 * kutatás nem tudta ellenőrizni. Amit találtam:
 *
 *   ✓ IGAZOLVA: `name` a cím (nem `title`), `location.remote` bool,
 *     `company.identifier`, `releasedDate`, `totalFound`/`offset`/`limit`
 *   ✗ ELTÉR: a `postingUrl` és az `applyUrl` a LISTÁBAN **null** — csak a
 *     részlet-endpointon van kitöltve. A publikus URL-t ezért felépítjük:
 *     `https://jobs.smartrecruiters.com/{cég}/{id}` — élőben 200-at ad.
 *   ✗ ELTÉR: a `location.country` KISBETŰS ISO-2 ("nl", "de"), nem országnév.
 *   + NEM DOKUMENTÁLT, de van: `location.hybrid`, `location.fullLocation`,
 *     `jobAdId`, `defaultJobAd`, `customField`, `visibility`, `language`
 *   + Az `industry`, `department`, `function`, `typeOfEmployment`,
 *     `experienceLevel` OBJEKTUMOK (`{id, label}`), nem stringek.
 *
 * A LISTÁBAN NINCS LEÍRÁS. A részlet-endpoint `jobAd.sections` mezője adja
 * (companyDescription, jobDescription, qualifications, additionalInformation)
 * — ezért kétfázisú a lekérdezés, mint a Greenhouse-nál.
 */
import { getJson, mapLimit } from "../http";
import { matchesQuery, stripHtml, toISO } from "../normalize";
import { COMPANIES } from "../companies";
import { defineSource, makeJob as mk } from "./base";
import type { Job } from "../types";

const API = "https://api.smartrecruiters.com/v1/companies";
const PUBLIC_URL = "https://jobs.smartrecruiters.com";
const TIMEOUT = 12000;
const DETAIL_TIMEOUT = 8000;

const CONCURRENCY = 4;
const PAGE_SIZE = 100;

/** Cégenként legfeljebb ennyi oldal. 14 cég × 2 oldal = 28 hívás. */
const MAX_PAGES = 2;

/** Hány hirdetésre kérünk leírást egy keresésben. */
const MAX_DETAILS = 40;
const DETAIL_CONCURRENCY = 5;

interface Labeled {
  id?: string;
  label?: string;
}

export interface SmartRecruitersPosting {
  id?: string;
  uuid?: string;
  refNumber?: string;
  /** A CÍM MEZŐJE — nem `title`, mint a Levernél a `text`. */
  name?: string;
  company?: { identifier?: string; name?: string };
  releasedDate?: string;
  location?: {
    city?: string;
    region?: string;
    /** KISBETŰS ISO-2: "nl", "de". */
    country?: string;
    remote?: boolean;
    /** Nem dokumentált, de létezik. */
    hybrid?: boolean;
    fullLocation?: string;
  };
  industry?: Labeled;
  department?: Labeled;
  function?: Labeled;
  typeOfEmployment?: Labeled;
  experienceLevel?: Labeled;
  /** A listában NULL — csak a részlet-endpointon van kitöltve. */
  postingUrl?: string | null;
  applyUrl?: string | null;
}

interface PostingDetail extends SmartRecruitersPosting {
  jobAd?: {
    sections?: Record<string, { title?: string; text?: string } | undefined>;
  };
}

/**
 * A publikus hirdetés URL-je.
 *
 * A lista `postingUrl` mezője null, ezért felépítjük. A minta élőben
 * ellenőrizve: HTTP 200 a slug-utótag nélkül is.
 */
export function postingUrl(companyId: string, postingId: string): string {
  return `${PUBLIC_URL}/${companyId}/${postingId}`;
}

/**
 * Egy SmartRecruiters hirdetés → közös Job séma.
 * Exportált, mert a test/smartrecruiters.test.ts a fixture-ön ellenőrzi.
 */
export function toJob(companyId: string, p: SmartRecruitersPosting): Job {
  const loc = p.location;
  const id = String(p.id ?? p.uuid ?? "");

  return mk({
    sourceId: "smartrecruiters",
    raw: p,
    externalId: id,
    // A cím záró szóközzel is jöhet ("Shift Lead (m/f/d) ").
    title: String(p.name ?? "").trim(),
    company: p.company?.name ?? companyId,
    // A listában nincs URL — felépítjük.
    url:
      p.postingUrl ??
      (id ? postingUrl(p.company?.identifier ?? companyId, id) : ""),
    location:
      loc?.fullLocation ??
      ([loc?.city, loc?.region].filter(Boolean).join(", ") || undefined),
    // A country KISBETŰS ISO-2 — nagybetűsíteni kell.
    country: loc?.country ? loc.country.toUpperCase() : undefined,
    // A hybrid NEM remote: irodába járást jelent.
    remote: loc?.remote === true,
    seniority: p.experienceLevel?.label,
    employmentType: p.typeOfEmployment?.label,
    postedAt: toISO(p.releasedDate),
    // Az objektum-mezőkből a `label` kell, nem maga az objektum.
    tags: [p.department?.label, p.function?.label, p.industry?.label].filter(
      Boolean,
    ) as string[],
  });
}

interface PostingsResponse {
  offset?: number;
  limit?: number;
  totalFound?: number;
  content?: SmartRecruitersPosting[];
}

/**
 * 2. fázis: leírás beszerzése. A lista NEM ad leírást, csak a részlet —
 * ezért a keresésre illeszkedő hirdetésekre kérünk részletet, felső
 * korláttal, a Greenhouse-nál bevált mintát követve.
 */
async function enrich(
  entries: { job: Job; company: string }[],
  q: string,
  signal: AbortSignal,
): Promise<void> {
  const wanted = entries
    .filter((e) => e.job.externalId && matchesQuery(e.job, q))
    .sort((a, b) => (b.job.postedAt ?? "").localeCompare(a.job.postedAt ?? ""))
    .slice(0, MAX_DETAILS);

  let i = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(DETAIL_CONCURRENCY, wanted.length) },
      async () => {
        while (i < wanted.length) {
          const e = wanted[i++];
          try {
            const detail = await getJson<PostingDetail>(
              `${API}/${e.company}/postings/${e.job.externalId}`,
              { signal, timeoutMs: DETAIL_TIMEOUT, retries: 0 },
            );
            const sections = detail.jobAd?.sections ?? {};
            const text = [
              "jobDescription",
              "qualifications",
              "additionalInformation",
            ]
              .map((k) => sections[k]?.text)
              .filter(Boolean)
              .join("\n\n");
            if (text) e.job.description = stripHtml(text);
            if (detail.postingUrl) e.job.url = detail.postingUrl;
            e.job.raw = detail;
          } catch {
            // Leírás nélkül is használható a hirdetés.
          }
        }
      },
    ),
  );
}

export const smartrecruiters = defineSource({
  meta: {
    id: "smartrecruiters",
    name: "SmartRecruiters",
    category: "ats",
    auth: "none",
    regionCodes: ["DE", "NL", "FR", "HU", "AT", "PL"],
    rateLimit: null,
    cacheTtlMinutes: 720,
    regions: "Nagyvállalati EU",
    docs: "https://developers.smartrecruiters.com/docs/posting-api",
    warning:
      "A lista postingUrl/applyUrl mezője NULL — a publikus URL-t felépítjük. A location.country kisbetűs ISO-2. Leírás csak a részlet-endpointon van.",
  },
  async fetch(params, signal) {
    const entries = await mapLimit(
      COMPANIES.smartrecruiters,
      CONCURRENCY,
      async (companyId) => {
        const out: { job: Job; company: string }[] = [];

        for (let page = 0; page < MAX_PAGES; page++) {
          const qs = new URLSearchParams({
            offset: String(page * PAGE_SIZE),
            limit: String(PAGE_SIZE),
          });
          const data = await getJson<PostingsResponse>(
            `${API}/${companyId}/postings?${qs}`,
            {
              signal,
              timeoutMs: TIMEOUT,
            },
          );

          const batch = data.content ?? [];
          out.push(
            ...batch.map((p) => ({
              job: toJob(companyId, p),
              company: companyId,
            })),
          );

          // A totalFound alapján tudjuk, mikor fogytunk ki — ez az egyetlen ATS,
          // ahol a lapozás rendesen dokumentált és a szerver megmondja a végét.
          const seen = (page + 1) * PAGE_SIZE;
          if (!batch.length || seen >= (data.totalFound ?? 0)) break;
        }
        return out;
      },
    );

    await enrich(entries, params.q, signal);
    return entries.map((e) => e.job);
  },
});
