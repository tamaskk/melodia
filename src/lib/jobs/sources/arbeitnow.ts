/**
 * Arbeitnow Job Board API — német és EU-s állások, kulcs nélkül.
 * https://www.arbeitnow.com/blog/job-board-api
 *
 * A DE célországhoz a BA Jobsuche után a legjobb ingyenes forrás — és annak
 * a tartaléka is: a BA nem hivatalos API, a v4 endpointja már meg is szűnt.
 * Ha a BA riasztó állapotba kerül, ez a modul MÉLYEBBEN lapoz, hogy pótolja.
 *
 * LAPOZÁS — élőben letesztelve (2026-09-01):
 *   • `?page=` MŰKÖDIK. A válasz `meta.info` mezője maga mondja ki:
 *     "Jobs are updated every hour ... Use `?page=` to paginate."
 *   • `links.next` adja a következő oldal URL-jét, de `links.last` NULL —
 *     az oldalak száma előre nem tudható.
 *   • A `meta.from`/`to` MEGBÍZHATATLAN: a 2. oldal `from: 101, to: 175`-öt
 *     ír, miközben 175 elemet ad vissza.
 *   • Az 1. és a 2. oldal 175-ből 14 elemben ÁTFED. A lista `created_at`
 *     szerint rendezett és óránként frissül, így az ablak elcsúszik a két
 *     kérés között. A dedup nem opció, hanem szükséglet.
 *   • A `page=99` nem 404, hanem HTTP 200 üres `data`-val — ez a megállási
 *     feltétel.
 *
 * ⚠️ ToS (a válasz `meta.terms` mezőjéből): "free public API for jobs, please
 * do not abuse. I would appreciate linking back to the site." Nem kötelező,
 * de illendő — ezért a meta.attribution ki van töltve.
 */
import { getJson } from "../http";
import { guessCountry, stripHtml, toISO } from "../normalize";
import { isAlerting } from "../health";
import { defineSource, makeJob as mk } from "./base";
import type { Job } from "../types";

const API = "https://www.arbeitnow.com/api/job-board-api";
const TIMEOUT = 15000;

/** Normál üzemmenet. Egy oldal 175 hirdetés, óránként frissül. */
const PAGES_NORMAL = 2;

/** Ha a BA Jobsuche halott, mélyebben megyünk — ez a forrás pótolja. */
const PAGES_FALLBACK = 5;

/** Kit pótolunk, ha az elromlik. */
const BACKS_UP = "bajobsuche";

export interface ArbeitnowJob {
  /** NINCS `id` mező — a slug az azonosító. */
  slug?: string;
  company_name?: string;
  title?: string;
  /** HTML, strippelni kell. */
  description?: string;
  /** Készen jön boolként — az egyik legtisztább forrás ebből a szempontból. */
  remote?: boolean;
  url?: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  /** Unix timestamp MÁSODPERCBEN, nem ms. */
  created_at?: number;
}

/**
 * Egy Arbeitnow hirdetés → közös Job séma.
 * Exportált, mert a test/arbeitnow.test.ts a mentett fixture-ön ellenőrzi.
 */
export function toJob(j: ArbeitnowJob): Job {
  const location = j.location || undefined;

  return mk({
    sourceId: "arbeitnow",
    raw: j,
    // Nincs id mező: a slug az azonosító, és a dedup kulcs része.
    externalId: String(j.slug ?? ""),
    title: String(j.title ?? ""),
    company: String(j.company_name ?? ""),
    url: j.url ?? "",
    location,
    // Alapértelmezés DE; a felismert város/ország felülírja. A lista német és
    // EU-s hirdetéseket is tartalmaz.
    country: guessCountry(location) ?? "DE",
    // A remote készen jön boolként — nem kell szövegből következtetni.
    remote: j.remote === true,
    description: stripHtml(j.description),
    // A created_at MÁSODPERCBEN van; a toISO 1e12 alatt másodpercnek veszi.
    postedAt: toISO(j.created_at),
    employmentType: j.job_types?.[0],
    tags: [...(j.tags ?? []), ...(j.job_types ?? []).slice(1)]
      .map(String)
      .slice(0, 12),
  });
}

/**
 * Hány oldalt kérjünk le. Külön függvény, hogy a tartalék-viselkedés
 * tesztelhető legyen hálózat nélkül.
 */
export function pagesToFetch(): number {
  return isAlerting(BACKS_UP) ? PAGES_FALLBACK : PAGES_NORMAL;
}

interface ArbeitnowResponse {
  data?: ArbeitnowJob[];
  links?: { next?: string | null; last?: string | null };
}

export const arbeitnow = defineSource({
  meta: {
    id: "arbeitnow",
    name: "Arbeitnow",
    category: "remote",
    auth: "none",
    regionCodes: ["DE"],
    rateLimit: null,
    // A meta.info szerint óránként frissül — ennél sűrűbben nincs értelme.
    cacheTtlMinutes: 60,
    regions: "Németország / EU",
    docs: "https://www.arbeitnow.com/blog/job-board-api",
    warning:
      "A lapozás oldalai átfedhetnek (óránként frissülő, created_at szerint rendezett lista). A BA Jobsuche tartaléka: ha az halott, mélyebben lapozunk.",
    attribution: { label: "Arbeitnow", url: "https://www.arbeitnow.com" },
    fallbackFor: [BACKS_UP],
  },
  async fetch(_params, signal) {
    // Ha a BA Jobsuche tartósan hibázik, ez a forrás fedezi a német piacot —
    // ilyenkor több oldalt kérünk le.
    const maxPages = pagesToFetch();
    const jobs: Job[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const data = await getJson<ArbeitnowResponse>(`${API}?page=${page}`, {
        signal,
        timeoutMs: TIMEOUT,
      });
      const batch = data.data ?? [];
      jobs.push(...batch.map(toJob));

      // Üres oldal a megállási feltétel (a szerver 200-at ad, nem 404-et),
      // és a `links.next` hiánya is megállít.
      if (!batch.length || !data.links?.next) break;
    }

    // Az oldalak átfedhetnek — a saját duplikátumokat itt szedjük ki, hogy a
    // rawCount se legyen félrevezető. A források KÖZTI dedup a dedupe() dolga.
    const seen = new Set<string>();
    return jobs.filter((j) => {
      if (!j.externalId || seen.has(j.externalId)) return false;
      seen.add(j.externalId);
      return true;
    });
  },
});
