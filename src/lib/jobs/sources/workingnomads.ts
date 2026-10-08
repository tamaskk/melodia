/**
 * Working Nomads — remote board, kulcs nélkül.
 * https://www.workingnomads.com/faq
 *
 * ⚠️ DOKUMENTÁLATLAN endpoint: csak a FAQ linkeli, nincs mögötte garancia.
 * A `health.ts` figyeli — ha három futáson át hibázik, riaszt.
 *
 * KÉT SAJÁTOSSÁG:
 *   • NINCS query paraméter. A teljes listát adja, a szűrés a mi dolgunk.
 *   • NINCS `id` mező — az `url` az azonosító, és a dedup kulcs része.
 */
import { getJson } from "../http";
import {
  eligibleCountries,
  guessCountry,
  isReachableFrom,
  stripHtml,
  toISO,
} from "../normalize";
import { defineSource, makeJob as mk } from "./base";
import type { Job } from "../types";

const API = "https://www.workingnomads.com/api/exposed_jobs/";
const TIMEOUT = 15000;

/** A teljes lista jön; ennél többet nem dolgozunk fel egy futásban. */
const MAX_JOBS = 400;

export interface WorkingNomadsJob {
  /** NINCS id — ez az azonosító. */
  url?: string;
  title?: string;
  description?: string;
  company_name?: string;
  category_name?: string;
  /** Vesszővel elválasztott string, nem tömb. */
  tags?: string;
  /** "WORLDWIDE", "Europe, North America, …", "Germany" */
  location?: string;
  pub_date?: string;
}

/**
 * Egy Working Nomads hirdetés → közös Job séma.
 * Exportált, mert a test/workingnomads.test.ts a fixture-ön ellenőrzi.
 */
export function toJob(j: WorkingNomadsJob): Job {
  const location = j.location ?? "";
  const countries = [
    ...new Set(
      location
        .split(",")
        .map((r) => guessCountry(r.trim()))
        .filter((c): c is string => Boolean(c)),
    ),
  ];

  return mk({
    sourceId: "workingnomads",
    raw: j,
    // Nincs id mező — az url azonosít.
    externalId: String(j.url ?? ""),
    title: String(j.title ?? ""),
    company: String(j.company_name ?? ""),
    url: j.url ?? "",
    location: location || undefined,
    country: countries[0],
    alsoCountries: countries.length > 1 ? countries.slice(1) : undefined,
    remote: true,
    description: stripHtml(j.description),
    postedAt: toISO(j.pub_date),
    // A tags STRING, nem tömb — vesszővel kell bontani.
    tags: [
      j.category_name,
      ...(typeof j.tags === "string"
        ? j.tags.split(",").map((t) => t.trim())
        : []),
    ]
      .filter(Boolean)
      .slice(0, 10) as string[],
  });
}

export const workingnomads = defineSource({
  meta: {
    id: "workingnomads",
    name: "Working Nomads",
    category: "remote",
    auth: "none",
    regionCodes: ["global"],
    rateLimit: null,
    cacheTtlMinutes: 720,
    regions: "Globális remote",
    docs: "https://www.workingnomads.com/faq",
    warning:
      "Dokumentálatlan endpoint, nincs garancia. Nincs query paraméter — kliensoldalon szűrünk.",
  },
  async fetch(_params, signal) {
    const data = await getJson<WorkingNomadsJob[]>(API, {
      signal,
      timeoutMs: TIMEOUT,
    });
    const list = Array.isArray(data) ? data : [];
    const eligible = eligibleCountries();

    // Nincs szerveroldali szűrő — a lokáció-korlátozást itt érvényesítjük.
    return list
      .slice(0, MAX_JOBS)
      .filter((j) => isReachableFrom(j.location, eligible))
      .map(toJob);
  },
});
