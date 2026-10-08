/**
 * The Muse API v2.
 * https://www.themuse.com/developers/api/v2
 *
 * Kulcs nélkül is megy (500 kérés/óra), kulccsal 3600/óra — ez a listán a
 * legbőkezűbb óránkénti keret. A kvótakezelés is a legkényelmesebb: a
 * szerver a VÁLASZFEJLÉCBEN mondja meg, hol tartunk.
 *
 * ⚠️ A `location` SZŰRŐ MEGBÍZHATATLAN — élőben mérve (2026-09-01):
 *
 *   location="Budapest, Hungary"      → 6600 találat, de a 20 visszaadottból
 *                                       NULLA van Budapesten (El Segundo CA,
 *                                       Lockhart TX, New York NY…)
 *   location="Berlin, Germany"        → 6592 találat, 20-ból 3 van Berlinben
 *   location="Nemletezo Varos, Sehol" → 6276 találat (!), ugyanannyi, mint a
 *                                       "Flexible / Remote"
 *   location="Flexible / Remote"      → 6276 találat, 20-ból 20 valóban remote
 *
 * Vagyis: a nem létező helyszín NEM üres eredményt ad, hanem teljeset — úgy
 * néz ki, mintha működne. Ezért a szűrőt elküldjük (szűkíti a halmazt), de
 * KLIENSOLDALON is szűrünk a `locations[].name` alapján. A "Flexible /
 * Remote" az egyetlen érték, amiben megbízhatunk.
 *
 * Nincs `X-RateLimit-Limit` fejléc, csak `Remaining` és `Reset` — a plafont
 * a kulcs meglétéből tudjuk (500 vagy 3600).
 */
import { jobsEnv } from "../env";
import { createLogger } from "../../logger";
import { getJsonWithHeaders } from "../http";
import { guessCountry, stripHtml, toISO } from "../normalize";
import { defineSource, makeJob as mk } from "./base";
import type { Job } from "../types";

const log = createLogger("jobs");

const API = "https://www.themuse.com/api/public/jobs";
const TIMEOUT = 15000;

/** Oldalanként 20 találat, a `page_count` több tízezer is lehet. */
const MAX_PAGES_PER_LOCATION = 3;

/** Ha a maradék keret a plafon 10%-a alá esik, magunktól leállunk. */
const SELF_STOP_RATIO = 0.1;

const LIMIT_WITH_KEY = 3600;
const LIMIT_WITHOUT_KEY = 500;

/**
 * Lekérdezett helyszínek, konfigból.
 *
 * A "Flexible / Remote" az egyetlen érték, amiben a szerveroldali szűrő
 * megbízhatóan működik — ezért mindig szerepel.
 */
function configuredLocations(): string[] {
  const raw = jobsEnv("MUSE_LOCATIONS");
  if (raw)
    return raw
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);
  return [
    "Flexible / Remote",
    "Budapest, Hungary",
    "Berlin, Germany",
    "Amsterdam, Netherlands",
  ];
}

interface MuseLevel {
  name?: string;
  short_name?: string;
}

export interface MuseJob {
  id?: number | string;
  name?: string;
  /** A leírás HTML-ben. */
  contents?: string;
  type?: string;
  publication_date?: string;
  locations?: { name?: string }[];
  categories?: { name?: string }[];
  /** TÖMB: [{ name: "Senior Level", short_name: "senior" }] */
  levels?: MuseLevel[];
  tags?: { name?: string }[];
  refs?: { landing_page?: string };
  company?: { id?: number; name?: string; short_name?: string };
}

/**
 * A Muse szintnevei → a közös séma `seniority` mezője.
 *
 * A doksi figyelmeztet, hogy az értékek kevert kis/nagybetűsek — ezért
 * kisbetűsen hasonlítunk, és a `short_name`-re is esünk vissza.
 */
export function toSeniority(levels?: MuseLevel[]): string | undefined {
  const first = levels?.[0];
  if (!first) return undefined;
  const name = (first.name ?? first.short_name ?? "").trim();
  if (!name) return undefined;
  switch (name.toLowerCase()) {
    case "internship":
    case "internship level":
      return "Internship";
    case "entry level":
    case "entry":
      return "Entry";
    case "mid level":
    case "mid":
      return "Mid";
    case "senior level":
    case "senior":
      return "Senior";
    case "management":
    case "manager":
      return "Management";
    default:
      return name;
  }
}

/** "Flexible / Remote" a Muse remote-jelölése. */
export function isRemoteLocation(name?: string): boolean {
  return /flexible\s*\/\s*remote|^remote$/i.test(name ?? "");
}

/**
 * Illeszkedik-e a hirdetés a kért helyszínre.
 *
 * Azért kell, mert a szerveroldali szűrő nem tartja magát a kéréshez.
 * A távmunka mindig elfogadható: az bárhonnan végezhető.
 */
export function matchesLocation(job: MuseJob, wanted: string): boolean {
  const names = (job.locations ?? []).map((l) => l.name ?? "");
  if (names.some(isRemoteLocation)) return true;
  if (isRemoteLocation(wanted)) return false;
  // "Budapest, Hungary" → elég a városnév egyezése.
  const city = wanted.split(",")[0].trim().toLowerCase();
  return names.some((n) => n.toLowerCase().includes(city));
}

/**
 * Egy Muse hirdetés → közös Job séma.
 * Exportált, mert a test/themuse.test.ts a mentett fixture-ön ellenőrzi.
 */
export function toJob(j: MuseJob): Job {
  const locations = (j.locations ?? [])
    .map((l) => l.name ?? "")
    .filter(Boolean);
  const location = locations.join(", ") || undefined;
  const countries = [
    ...new Set(
      locations
        .map((l) => guessCountry(l))
        .filter((c): c is string => Boolean(c)),
    ),
  ];

  return mk({
    sourceId: "themuse",
    raw: j,
    externalId: String(j.id ?? ""),
    title: String(j.name ?? ""),
    company: String(j.company?.name ?? j.company?.short_name ?? ""),
    url: j.refs?.landing_page ?? "",
    location,
    country: countries[0],
    alsoCountries: countries.length > 1 ? countries.slice(1) : undefined,
    remote: locations.some(isRemoteLocation),
    description: stripHtml(j.contents),
    seniority: toSeniority(j.levels),
    postedAt: toISO(j.publication_date),
    tags: [
      ...(j.categories ?? []).map((c) => c.name),
      ...(j.tags ?? []).map((t) => t.name),
    ]
      .filter(Boolean)
      .slice(0, 10) as string[],
  });
}

interface MuseResponse {
  page?: number;
  page_count?: number;
  total?: number;
  results?: MuseJob[];
}

/** A fejlécből olvasott maradék keret. Nincs `Limit` fejléc, csak `Remaining`. */
export function remainingFromHeaders(headers: Headers): number | undefined {
  const v = headers.get("x-ratelimit-remaining");
  if (v == null) return undefined;
  const n = Number(v);
  return isFinite(n) ? n : undefined;
}

export const themuse = defineSource({
  meta: {
    id: "themuse",
    name: "The Muse",
    category: "aggregator",
    auth: "none",
    regionCodes: ["global"],
    rateLimit: { perHour: LIMIT_WITHOUT_KEY },
    cacheTtlMinutes: 360,
    regions: "Globális, US-túlsúly",
    docs: "https://www.themuse.com/developers/api/v2",
    warning:
      "Kulcs nélkül 500 kérés/óra, MUSE_KEY-jel 3600. A location szűrő megbízhatatlan — kliensoldalon is szűrünk. Önleállítás, ha a maradék keret 10% alá esik.",
  },
  async fetch(_params, signal) {
    const key = jobsEnv("MUSE_KEY");
    const limit = key ? LIMIT_WITH_KEY : LIMIT_WITHOUT_KEY;
    const stopBelow = limit * SELF_STOP_RATIO;

    const out: Job[] = [];

    for (const wanted of configuredLocations()) {
      for (let page = 1; page <= MAX_PAGES_PER_LOCATION; page++) {
        const qs = new URLSearchParams({
          page: String(page),
          location: wanted,
        });
        if (key) qs.set("api_key", key);

        const { data, headers } = await getJsonWithHeaders<MuseResponse>(
          `${API}?${qs}`,
          {
            signal,
            timeoutMs: TIMEOUT,
            retries: 1,
          },
        );

        // A szerveroldali szűrő nem tartja magát a kéréshez — itt szűrünk.
        out.push(
          ...(data.results ?? [])
            .filter((j) => matchesLocation(j, wanted))
            .map(toJob),
        );

        // ÖNLEÁLLÍTÁS: a szerver megmondja, hol tartunk. Nem várjuk meg a 429-et.
        const remaining = remainingFromHeaders(headers);
        if (remaining != null && remaining < stopBelow) {
          log.warn(
            `themuse önleállítás: ${remaining} hívás maradt a ${limit}-es óránkénti keretből.`,
          );
          return out;
        }

        if (page >= (data.page_count ?? 1)) break;
      }
    }

    return out;
  },
});
