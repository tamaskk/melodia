/**
 * Jooble — az egyik kevés aggregátor valós magyar lefedettséggel.
 *
 * ⚠️ AZ 500 HÍVÁS A KULCS TELJES ÉLETTARTAMÁRA SZÓL, nem havonta töltődik.
 * Ez nem pollozható forrás, hanem szűkös erőforrás. Ezért:
 *
 *   1. Élő hívás csak JOOBLE_LIVE=1 mellett megy ki — enélkül a forrás
 *      hibát jelez, és nem eszi a keretet.
 *   2. PERZISZTENS hívásszámláló (Mongo, `app_state`): figyelmeztetés 400-nál,
 *      HARD STOP 490-nél. A számláló adatbázisban él, tehát újraindítás nem
 *      nullázza — memóriában semmit sem érne.
 *   3. 24 ÓRÁS CACHE lekérdezésenként. Ugyanarra a keresésre naponta
 *      legfeljebb egy hívás mehet ki.
 *   4. KEVÉS, SZÉLES lekérdezés: egy hívás 50 találattal jobb, mint öt szűk.
 *
 * BIZTONSÁG: a kulcs az URL PATH-ban van, nem fejlécben. A közös http.ts a
 * hibaüzenetbe beleteszi az URL-t — ezért minden kimenő hibát átengedünk egy
 * maszkolón, különben a kulcs kikerülne a UI-ra és a logba.
 */
import { jobsEnv } from "../env";
import { createLogger } from "../../logger";
import { postJson, SourceError } from "../http";
import { getCached, setCached } from "../cache";
import {
  quotaExhausted,
  quotaState,
  recordCall,
  type QuotaConfig,
} from "../quota";
import { parseHungarianSalary } from "../parse/hungarian-salary";
import { stripHtml, toISO } from "../normalize";
import { defineSource, makeJob as mk } from "./base";
import type { Job } from "../types";

const log = createLogger("jobs");

const TIMEOUT = 15000;

/** Ugyanarra a lekérdezésre naponta legfeljebb egy hívás. */
const CACHE_TTL_MINUTES = 24 * 60;

/** Egy hívás, sok találat — ez a helyes arány véges keretnél. */
const RESULTS_PER_PAGE = 50;

export const JOOBLE_QUOTA: QuotaConfig = {
  limit: 500,
  warnAt: 400,
  stopAt: 490,
};

const QUOTA_ID = "jooble";

export interface JoobleJob {
  id?: string | number;
  title?: string;
  location?: string;
  /** Csak részlet — teljes leírás nincs. */
  snippet?: string;
  /** SZABADSZÖVEG magyarul: "400 000 - 600 000 Ft/hó". */
  salary?: string;
  source?: string;
  type?: string;
  link?: string;
  company?: string;
  updated?: string;
}

/**
 * A kulcs kimaszkolása bármilyen szövegből.
 *
 * A kulcs az URL path-ban utazik, és a HTTP-hiba üzenete tartalmazza az
 * URL-t. Enélkül a kulcs kikerülne a válaszba és a szerver logjába.
 */
export function redactKey(text: string, key?: string): string {
  let out = text;
  if (key) out = out.split(key).join("***");
  // Öv és nadrágtartó: a jooble.org/api/ utáni bármilyen token is kiesik.
  return out.replace(/(jooble\.org\/api\/)[^\s/?#]+/gi, "$1***");
}

/**
 * Egy Jooble hirdetés → közös Job séma.
 * Exportált, mert a test/jooble.test.ts a fixture-ön ellenőrzi.
 */
export function toJob(j: JoobleJob): Job {
  // A fizetés szabadszöveg — parser nélkül a magyar hirdetéseknek sosem
  // lenne fizetésadatuk.
  const salary = parseHungarianSalary(j.salary);

  return mk({
    sourceId: "jooble",
    raw: j,
    externalId: String(j.id ?? j.link ?? ""),
    title: String(j.title ?? ""),
    company: String(j.company ?? j.source ?? ""),
    url: j.link ?? "",
    location: j.location || undefined,
    // A hu.jooble.org kizárólag magyar hirdetéseket ad.
    country: "HU",
    remote: false,
    // Csak snippet van; a teljes leírás megszerzése már scraping lenne.
    description: stripHtml(j.snippet),
    salaryMin: salary.min,
    salaryMax: salary.max,
    currency: salary.currency,
    salaryPeriod: salary.period,
    employmentType: j.type || undefined,
    postedAt: toISO(j.updated),
    tags: j.source ? [j.source] : undefined,
  });
}

export const jooble = defineSource({
  meta: {
    id: "jooble",
    name: "Jooble (HU)",
    category: "aggregator",
    auth: "key",
    envKeys: ["JOOBLE_KEY"],
    regionCodes: ["HU"],
    rateLimit: { lifetime: 500 },
    cacheTtlMinutes: CACHE_TTL_MINUTES,
    regions: "Magyarország",
    docs: "https://jooble.org/api/about",
    warning:
      "FIGYELEM: 500 hívás a kulcs TELJES ÉLETTARTAMÁRA, nem havonta. Élő hívás csak JOOBLE_LIVE=1 mellett megy ki.",
  },
  async fetch(params, signal) {
    if (jobsEnv("JOOBLE_LIVE") !== "1") {
      throw new SourceError(
        "Az élő hívás ki van kapcsolva: a keret 500 hívás a kulcs teljes élettartamára. Bekapcsolás: JOOBLE_LIVE=1.",
        "config",
      );
    }

    const key = jobsEnv("JOOBLE_KEY");
    if (!key) throw new SourceError("Hiányzó JOOBLE_KEY", "config");

    const host = jobsEnv("JOOBLE_HOST") ?? "hu.jooble.org";
    // A keywords ÉS a location is kötelező; üres location-nel nincs országos
    // találat. Nagy sugárral Budapest a legszélesebb egyetlen lekérdezés.
    const keywords = params.q || "fejlesztő";
    const location = jobsEnv("JOOBLE_LOCATION") ?? "Budapest";
    const cacheKey = `jooble:${host}:${keywords}:${location}`;

    // 2. Napi cache lekérdezésenként.
    const cached = getCached<Job[]>(cacheKey);
    if (cached) return cached;

    // 3. Hard stop a keret elfogyása ELŐTT.
    if (await quotaExhausted(QUOTA_ID, JOOBLE_QUOTA)) {
      const { used } = await quotaState(QUOTA_ID);
      throw new SourceError(
        `Kvóta kimerült: ${used}/${JOOBLE_QUOTA.limit} hívás elhasználva (hard stop ${JOOBLE_QUOTA.stopAt}). ` +
          `Új kulcs kell, vagy tudatosan emeld a stopAt értéket.`,
        "config",
      );
    }

    try {
      const data = await postJson<{ totalCount?: number; jobs?: JoobleJob[] }>(
        `https://${host}/api/${key}`,
        {
          keywords,
          location,
          radius: Number(jobsEnv("JOOBLE_RADIUS") ?? 40),
          ResultOnPage: RESULTS_PER_PAGE,
        },
        // retries: 0 — minden újrapróbálkozás a véges keretből megy.
        { signal, timeoutMs: TIMEOUT, retries: 0 },
      );
      return setCached(
        cacheKey,
        (data.jobs ?? []).map(toJob),
        CACHE_TTL_MINUTES,
      );
    } catch (err) {
      // A kulcs SOHA nem kerülhet a hibaüzenetbe: az a válaszba és a logba is
      // eljutna.
      const message = redactKey(
        err instanceof Error ? err.message : String(err),
        key,
      );
      throw new SourceError(
        message,
        err instanceof SourceError ? err.kind : "unavailable",
      );
    } finally {
      // A szerver a hibás hívást is levonja a keretből — ezért itt számolunk,
      // nem a sikeres ágon.
      // Ha maga a számlálás bukik el, az a naplóba megy: a már kifizetett
      // hívás eredményét nem dobhatja el.
      await recordCall(QUOTA_ID, JOOBLE_QUOTA).catch((error: Error) =>
        log.error(
          `a Jooble-hívás nincs elszámolva a keretből: ${error.message}`,
        ),
      );
    }
  },
});
