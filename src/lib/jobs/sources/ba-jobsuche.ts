/**
 * Bundesagentur für Arbeit — Jobsuche API.
 * https://jobsuche.api.bund.dev/
 *
 * A teljes német állásadatbázis, regisztráció nélkül, egyetlen fix fejléccel.
 * Ha a DE célország, ez az egy forrás többet ad, mint a többi német forrás
 * együtt (egy "Softwareentwickler" keresésre 3535 találat).
 *
 * ⚠️ NEM hivatalos, NEM dokumentált API — közösségi reverse-engineering
 * (bundesAPI). Nincs publikált licenc, bármikor megváltozhat. És meg is
 * változott: a `pc/v4/jobs` mára 403-at ad, a lista a `v6`-on él. A
 * részletek viszont FORDÍTVA: a `v4/jobdetails` működik, a `v6` 403-at ad.
 * Ezért monitorozzuk (src/lib/health.ts): három egymást követő hiba után a
 * forrás riasztást kap a UI-on és a logban.
 *
 * KÉTFÁZISÚ: a listaválaszban NINCS leírás, azt hirdetésenként külön hívás
 * adja — throttle-lal és felső korláttal, nem 500 párhuzamos kéréssel.
 */
import { jobsEnv } from "../env";
import { getJson } from "../http";
import { matchesQuery, num, stripHtml, toISO } from "../normalize";
import { defineSource, makeJob as mk } from "./base";
import type { Job, SalaryPeriod } from "../types";

const BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc";

/** Publikusan ismert kliens-azonosító, NEM személyes kulcs. */
const API_KEY = "jobboerse-jobsuche";

const LIST_TIMEOUT = 15000;
const DETAIL_TIMEOUT = 8000;

/** A DoD kifejezetten max ~5 párhuzamos részlet-hívást kér. */
const DETAIL_CONCURRENCY = 5;

/** Hány hirdetésre kérünk leírást EGY keresésben. A 25 s-os plafon a korlát. */
const MAX_DETAILS = 60;

const PAGE_SIZE = 100;
const MAX_PAGES = 3;

/**
 * Inkrementális futás: alapból csak az elmúlt hét hirdetései.
 *
 * A teljes adatbázis naponta letöltése pazarlás és a ToS szellemével is
 * szembemegy. Mérve: "Softwareentwickler" → 3535 hirdetés összesen, de csak
 * 530 az elmúlt hétből. Felülírható: BA_PUBLISHED_SINCE_DAYS.
 */
const PUBLISHED_SINCE_DAYS = jobsEnv("BA_PUBLISHED_SINCE_DAYS") ?? "7";

/**
 * Ha a keresés üres, a BA HTTP 400-at ad — a `was` paraméter kötelező.
 * Ez az alapértelmezés tartja életben az "üres kereső" esetet.
 */
const DEFAULT_QUERY = "Softwareentwickler";

interface BaAddress {
  plz?: string;
  ort?: string;
  region?: string;
  /** "DEUTSCHLAND" | "OESTERREICH" | … */
  land?: string;
}

export interface BaJob {
  /** v6-ban `referenznummer` (a v4-ben `refnr` volt). */
  referenznummer?: string;
  stellenangebotsTitel?: string;
  hauptberuf?: string;
  alternativBeruf1?: string;
  alleBerufe?: string[];
  /** A cég neve. */
  firma?: string;
  arbeitgeberKundennummerHash?: string;
  stellenlokationen?: { adresse?: BaAddress }[];
  datumErsteVeroeffentlichung?: string;
  aenderungsdatum?: string;
  eintrittszeitraum?: { von?: string };
  arbeitszeitVollzeit?: boolean;
  /** "JAHRESGEHALT" | "STUNDENLOHN" | "KEINE_ANGABEN" */
  verguetungsangabe?: string;
  artDerVerguetung?: string | null;
  festgehalt?: number;
  /** Csak a részlet-hívásból. */
  stellenangebotsBeschreibung?: string;
}

const LAND_TO_ISO: Record<string, string> = {
  DEUTSCHLAND: "DE",
  OESTERREICH: "AT",
  SCHWEIZ: "CH",
};

/** A `verguetungsangabe` enumból a közös séma periódusa. */
function toSalaryPeriod(v?: string): SalaryPeriod | undefined {
  switch (v) {
    case "JAHRESGEHALT":
      return "year";
    case "MONATSGEHALT":
      return "month";
    case "STUNDENLOHN":
      return "hour";
    default:
      return undefined;
  }
}

/**
 * A refnr Base64-kódolása a részletek lekéréséhez.
 *
 * Ez a forrás legelső buktatója, és sehol nincs rendesen dokumentálva.
 * Élőben ellenőrizve: a nyers azonosítóval a v4/jobdetails 404-et ad,
 * a Base64-elttel 200-at.
 */
export function encodeRefnr(refnr: string): string {
  return Buffer.from(refnr, "utf8").toString("base64");
}

/**
 * Egy BA hirdetés → közös Job séma.
 * Exportált, mert a test/ba-jobsuche.test.ts a mentett fixture-ön ellenőrzi.
 */
export function toJob(j: BaJob): Job {
  const addr = j.stellenlokationen?.[0]?.adresse;
  const location =
    [addr?.ort, addr?.region].filter(Boolean).join(", ") || undefined;
  const title = j.stellenangebotsTitel ?? j.hauptberuf ?? "";
  const refnr = String(j.referenznummer ?? "");

  return mk({
    sourceId: "bajobsuche",
    raw: j,
    externalId: refnr,
    title,
    company: j.firma ?? "Bundesagentur für Arbeit",
    // A válaszban nincs externeUrl — a jelentkezés a BA saját felületén megy.
    url: refnr
      ? `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(refnr)}`
      : "",
    location,
    // Alapból DE, de a válaszban osztrák hirdetés is előfordul.
    country: LAND_TO_ISO[String(addr?.land ?? "").toUpperCase()] ?? "DE",
    // A listában nincs home-office jelzés; a szöveges felismerés a részlet
    // beérkezése után pontosabb, ezért az enrich felülírja.
    remote: false,
    description: stripHtml(j.stellenangebotsBeschreibung),
    salaryMin: num(j.festgehalt),
    currency: j.festgehalt ? "EUR" : undefined,
    salaryPeriod: toSalaryPeriod(j.verguetungsangabe),
    employmentType: j.arbeitszeitVollzeit ? "Vollzeit" : undefined,
    postedAt: toISO(j.datumErsteVeroeffentlichung ?? j.aenderungsdatum),
    tags: [j.hauptberuf, j.alternativBeruf1].filter(Boolean) as string[],
  });
}

const HEADERS = { "X-API-Key": API_KEY };

/**
 * 2. fázis: leírás beszerzése. A listaválaszban nincs leírás, hirdetésenként
 * külön hívás kell — ezért throttle (DETAIL_CONCURRENCY) és felső korlát
 * (MAX_DETAILS). Egy elbukó hívás nem hiba: a hirdetés marad, leírás nélkül.
 */
async function enrich(
  jobs: Job[],
  q: string,
  signal: AbortSignal,
): Promise<void> {
  const wanted = jobs
    .filter((j) => j.externalId && matchesQuery(j, q))
    .sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""))
    .slice(0, MAX_DETAILS);

  let i = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(DETAIL_CONCURRENCY, wanted.length) },
      async () => {
        while (i < wanted.length) {
          const job = wanted[i++];
          try {
            // A RÉSZLETEK a v4-en élnek — a v6/jobdetails 403-at ad.
            const detail = await getJson<BaJob>(
              `${BASE}/v4/jobdetails/${encodeRefnr(job.externalId)}`,
              {
                signal,
                timeoutMs: DETAIL_TIMEOUT,
                headers: HEADERS,
                retries: 0,
              },
            );
            const text = stripHtml(detail.stellenangebotsBeschreibung);
            if (text) {
              job.description = text;
              // Home office csak a leírásból derül ki (lásd az arbeitszeit=ho
              // csapdát a fetch-ben).
              job.remote =
                /\b(home\s?office|homeoffice|remote|telearbeit|mobiles arbeiten)\b/i.test(
                  text,
                );
            }
            job.raw = detail;
          } catch {
            // Leírás nélkül is használható a hirdetés.
          }
        }
      },
    ),
  );
}

export const bajobsuche = defineSource({
  meta: {
    id: "bajobsuche",
    name: "Bundesagentur Jobsuche",
    category: "gov",
    auth: "fixed",
    regionCodes: ["DE", "AT"],
    rateLimit: null,
    cacheTtlMinutes: 360,
    regions: "Németország",
    docs: "https://jobsuche.api.bund.dev/",
    warning:
      "Nem hivatalos API (közösségi reverse-engineering). A lista a v6-on, a részletek a v4-en élnek; a v4/jobs már 403. Alapból csak az elmúlt 7 nap.",
  },
  async fetch(params, signal) {
    const jobs: Job[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const qs = new URLSearchParams({
        // Üres `was` esetén a szerver HTTP 400-at ad — kötelező paraméter.
        was: params.q || DEFAULT_QUERY,
        page: String(page),
        size: String(PAGE_SIZE),
        veroeffentlichtseit: PUBLISHED_SINCE_DAYS,
      });
      // Remote-szűrő. Az `arbeitszeit=ho` ÖNMAGÁBAN minden lekérdezésre 0-t ad
      // (élőben mérve, több queryn) — használhatatlan. A `vz;ho` a működő
      // alak: teljes munkaidő VAGY home office.
      if (params.remoteOnly) qs.set("arbeitszeit", "vz;ho");

      const data = await getJson<{
        ergebnisliste?: BaJob[];
        maxErgebnisse?: number;
      }>(`${BASE}/v6/jobs?${qs}`, {
        signal,
        timeoutMs: LIST_TIMEOUT,
        headers: HEADERS,
      });
      const batch = data.ergebnisliste ?? [];
      jobs.push(...batch.map(toJob));
      if (batch.length < PAGE_SIZE) break;
    }

    await enrich(jobs, params.q, signal);
    return jobs;
  },
});
