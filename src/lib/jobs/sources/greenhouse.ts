/**
 * Greenhouse Job Board API — hivatalos, dokumentált, kulcs nélküli.
 * https://developers.greenhouse.io/job-board.html
 *
 * Ez a legjobb adatminőségű forrás az egész appban: a cégek maguk publikálják
 * a saját karrieroldalukhoz, tehát nem scraping, és jogilag tiszta.
 *
 * KÉTFÁZISÚ LEKÉRDEZÉS. A `?content=true` egyetlen hívásban adná a leírást is,
 * de mérve: a databricks boardja listaként 0,70 MB, content=true-val 8,87 MB.
 * 46 boardon ez keresésenként ~100 MB lenne. Ezért:
 *   1. fázis — lista content nélkül, boardonként egy hívás (cím, cég, lokáció)
 *   2. fázis — csak a keresésre illeszkedő hirdetésekre kérünk részletet,
 *              felső korláttal (MAX_DETAILS)
 *
 * A ToS karrieroldal-beágyazásra készült: az olvasás rendben van, az agresszív
 * pollozás nem. A hirdetések nem változnak óránként — cacheTtlMinutes: 720.
 */
import { getJson, mapLimit } from "../http";
import {
  guessCountry,
  looksRemote,
  matchesQuery,
  stripHtml,
  toISO,
} from "../normalize";
import { COMPANIES } from "../companies";
import { defineSource, makeJob as mk } from "./base";
import type { Job } from "../types";

const BOARD_CONCURRENCY = 5;
const DETAIL_CONCURRENCY = 6;
const LIST_TIMEOUT = 12000;
const DETAIL_TIMEOUT = 8000;

/**
 * Hány hirdetésre kérünk részletet EGY keresésben, összesen.
 * A 25 s-os globális timeout a korlát: 80 hívás 6-os konkurenciával ~13 kör,
 * hirdetésenként ~10 kB — nagyságrendekkel kevesebb, mint a content=true.
 */
const MAX_DETAILS = 80;

const API = "https://boards-api.greenhouse.io/v1/boards";

interface GhOffice {
  name?: string;
  location?: string;
}

export interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  company_name?: string;
  location?: { name?: string };
  updated_at?: string;
  first_published?: string;
  /** ISO dátum vagy null — a lista is adja, nem kell hozzá részlet-hívás. */
  application_deadline?: string | null;
  requisition_id?: string;
  internal_job_id?: number;
  /** Csak a részlet-hívásban (vagy ?content=true esetén). HTML-ESCAPE-ELT string. */
  content?: string;
  departments?: { name?: string }[];
  offices?: GhOffice[];
}

/**
 * Egy Greenhouse hirdetés → közös Job séma.
 *
 * A lista `location.name`-je szabadszöveg: "Berlin, Germany", "Remote - EMEA",
 * "Multiple Locations". Exportált, mert a test/greenhouse.test.ts a mentett
 * fixture-ön ellenőrzi a leképezést.
 */
export function toJob(token: string, j: GhJob): Job {
  const location = j.location?.name ?? j.offices?.[0]?.name;
  // Az irodák akkor segítenek, ha a location szabadszövegéből nem jön ki ország
  // ("Remote - EMEA", "Multiple Locations").
  const officeCountry = j.offices
    ?.map((o) => guessCountry(o.location ?? o.name))
    .find(Boolean);

  return mk({
    sourceId: "greenhouse",
    raw: j,
    externalId: String(j.id),
    title: j.title,
    company: j.company_name ?? token,
    url: j.absolute_url,
    location,
    country: guessCountry(location) ?? officeCountry,
    remote: looksRemote(location, j.title),
    // A content HTML-escaped stringként jön, nem nyers HTML-ként — a stripHtml
    // ciklusban oldja fel az entitásokat, ezért kezeli a dupla escape-et is.
    description: stripHtml(j.content),
    postedAt: toISO(j.first_published ?? j.updated_at),
    expiresAt: toISO(j.application_deadline),
    tags: j.departments?.map((d) => d.name).filter(Boolean) as
      string[] | undefined,
  });
}

interface Entry {
  job: Job;
  token: string;
  id: number;
}

/**
 * 2. fázis: leírás (és departments/offices) beszerzése a releváns hirdetésekre.
 *
 * A `matchesQuery` itt előszűrő, NEM végleges szűrés: a nem illeszkedő
 * hirdetéseket is visszaadjuk, csak leírás nélkül. A végső szűrést a
 * searchAll végzi — így nem szűrünk kétszer, és nem tűnik el találat.
 *
 * A RENDEZÉS ITT NEM KOZMETIKA. A searchAll postedAt szerint csökkenő
 * sorrendben vágja le a listát, tehát ha itt board-sorrendben választanánk ki
 * a dúsítandókat, pont azokat a hirdetéseket dúsítanánk, amiket a felhasználó
 * sosem lát — és a megjelenő kártyák maradnának leírás nélkül.
 *
 * Egy elbukó részlet-hívás nem hiba: a hirdetés marad, leírás nélkül.
 */
async function enrich(
  entries: Entry[],
  q: string,
  signal: AbortSignal,
): Promise<void> {
  const wanted = entries
    .filter((e) => matchesQuery(e.job, q))
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
            const detail = await getJson<GhJob>(
              `${API}/${e.token}/jobs/${e.id}`,
              {
                signal,
                timeoutMs: DETAIL_TIMEOUT,
                retries: 0,
              },
            );
            e.job.description = stripHtml(detail.content) ?? e.job.description;
            e.job.tags =
              (detail.departments?.map((d) => d.name).filter(Boolean) as
                string[] | undefined) ?? e.job.tags;
            e.job.country =
              e.job.country ??
              detail.offices
                ?.map((o) => guessCountry(o.location ?? o.name))
                .find(Boolean);
            // A részlet gazdagabb: ez legyen a megőrzött nyers objektum.
            e.job.raw = detail;
          } catch {
            // Leírás nélkül is használható a hirdetés — megyünk tovább.
          }
        }
      },
    ),
  );
}

export const greenhouse = defineSource({
  meta: {
    id: "greenhouse",
    name: "Greenhouse",
    category: "ats",
    auth: "none",
    regionCodes: ["global"],
    rateLimit: null,
    cacheTtlMinutes: 720,
    regions: "Globális",
    docs: "https://developers.greenhouse.io/job-board.html",
    warning: "Karrieroldal-beágyazásra készült API. Napi 1 lekérés bőven elég.",
  },
  async fetch(params, signal) {
    // Egy halott token 404-et ad, azt a mapLimit csendben elnyeli. Ha MINDEN
    // board elbukik, dob — az már nem "nincs találat", hanem elérhetetlen API.
    const entries = await mapLimit(
      COMPANIES.greenhouse,
      BOARD_CONCURRENCY,
      async (token) => {
        const data = await getJson<{ jobs?: GhJob[] }>(`${API}/${token}/jobs`, {
          signal,
          timeoutMs: LIST_TIMEOUT,
        });
        return (data.jobs ?? []).map((j): Entry => ({
          job: toJob(token, j),
          token,
          id: j.id,
        }));
      },
    );

    await enrich(entries, params.q, signal);
    return entries.map((e) => e.job);
  },
});
