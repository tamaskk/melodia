/**
 * Careerjet — a második aggregátor valós magyar lefedettséggel.
 * https://www.careerjet.com/partners/api
 *
 * A JOOBLE TARTALÉKA. A Jooble kerete 500 hívás élethosszig; ha az elfogy
 * vagy a forrás elromlik, a magyar piacot ez fedezi. Ellentétben a Joobléval
 * itt nincs publikált élettartam-korlát, és a regisztráció önkiszolgáló.
 *
 * 60+ locale van, tehát ugyanez az integráció adja a DE/AT/NL/ES célországokat
 * is — locale-onként egy-egy hívással.
 *
 * ÉLŐBEN MÉRVE (2026-09-01):
 *   • A `v4/query` él, és kulcs nélkül tiszta 401-et ad JSON-ban.
 *   • A `v3` (public.api.careerjet.net) NEM ÉL — a kapcsolatot elutasítja
 *     (ECONNREFUSED). A doksi „ha furcsaságot látsz, nézd meg a v3-at is"
 *     tanácsa tehát már nem alkalmazható.
 *
 * BUKTATÓK:
 *   • A `user_ip` és a `user_agent` KÖTELEZŐ. Az API végfelhasználó nevében
 *     történő kérdezést feltételez; szerveroldali batchnél a saját szerver
 *     IP-je és egy értelmes UA a helyes válasz. Konfigból jön, nem beégetve.
 *   • A Basic auth jelszava ÜRES, de a kettőspont kell: `KULCS:`.
 *   • Az országot a `locale_code` dönti el, NEM a `location`. Rossz
 *     locale-lal üres eredmény jön, nem hiba — ezért nem is vesszük észre.
 */
import { jobsEnv } from "../env";
import { getJson, sleep, SourceError } from "../http";
import { isAlerting } from "../health";
import { stripHtml, toISO, num } from "../normalize";
import { defineSource, makeJob as mk } from "./base";
import type { Job, SalaryPeriod } from "../types";

const API = "https://search.api.careerjet.net/v4/query";
const TIMEOUT = 15000;

/**
 * A rate limit nincs publikálva. Ismeretlen korlátnál a konzervatív választás
 * a helyes: legfeljebb 1 kérés másodpercenként.
 */
const THROTTLE_MS = 1000;

const PAGE_SIZE = 100;

/** Kit pótolunk, ha az elfogy vagy elromlik. */
const BACKS_UP = "jooble";

/** locale_code → ISO-3166-1 alpha-2. Az országot a locale dönti el. */
export const LOCALE_COUNTRY: Record<string, string> = {
  hu_HU: "HU",
  de_DE: "DE",
  de_AT: "AT",
  de_CH: "CH",
  nl_NL: "NL",
  nl_BE: "BE",
  es_ES: "ES",
  en_GB: "GB",
  en_IE: "IE",
  fr_FR: "FR",
  it_IT: "IT",
  pt_PT: "PT",
  pl_PL: "PL",
  cs_CZ: "CZ",
  ro_RO: "RO",
};

const DEFAULT_LOCALES = ["hu_HU", "de_DE", "de_AT", "nl_NL", "es_ES"];

/** Konfigból, hogy ne kelljen kódot írni egy új célországhoz. */
function configuredLocales(): string[] {
  const raw = jobsEnv("CAREERJET_LOCALES");
  if (!raw) return DEFAULT_LOCALES;
  return raw
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
}

export interface CareerjetSalary {
  min?: number | string;
  max?: number | string;
  currency?: string;
  /** Periódus jelölése; a forrás többféle alakot használ. */
  type?: string;
}

export interface CareerjetJob {
  title?: string;
  company?: string;
  date?: string;
  /** Csak részlet, nem teljes leírás — ugyanaz a korlát, mint a Jooble-nél. */
  description?: string;
  locations?: string;
  salary?: CareerjetSalary | string;
  url?: string;
}

/** A `salary.type` sokféle alakban jön — mindet egy sémára hozzuk. */
export function toSalaryPeriod(type?: string): SalaryPeriod | undefined {
  const t = (type ?? "").toLowerCase();
  if (!t) return undefined;
  if (
    t.startsWith("y") ||
    t.includes("year") ||
    t.includes("annu") ||
    t.includes("év")
  )
    return "year";
  if (t.startsWith("m") || t.includes("month") || t.includes("hó"))
    return "month";
  if (t.startsWith("h") || t.includes("hour") || t.includes("óra"))
    return "hour";
  return undefined;
}

/**
 * Egy Careerjet hirdetés → közös Job séma.
 * Exportált, mert a test/careerjet.test.ts a fixture-ön ellenőrzi.
 */
export function toJob(j: CareerjetJob, locale: string): Job {
  // A salary jöhet objektumként és szabadszövegként is.
  const sal = typeof j.salary === "object" && j.salary ? j.salary : undefined;

  return mk({
    sourceId: "careerjet",
    raw: j,
    // Nincs stabil id a válaszban — az URL azonosít.
    externalId: String(j.url ?? ""),
    title: String(j.title ?? ""),
    company: String(j.company ?? ""),
    url: j.url ?? "",
    location: j.locations || undefined,
    // Az országot a LOCALE dönti el, nem a location szövege.
    country: LOCALE_COUNTRY[locale],
    remote: false,
    description: stripHtml(j.description),
    salaryMin: num(sal?.min),
    salaryMax: num(sal?.max),
    currency: sal?.currency,
    salaryPeriod: toSalaryPeriod(sal?.type),
    postedAt: toISO(j.date),
    tags: [locale],
  });
}

export const careerjet = defineSource({
  meta: {
    id: "careerjet",
    name: "Careerjet",
    category: "aggregator",
    auth: "key",
    envKeys: ["CAREERJET_KEY"],
    regionCodes: ["HU", "DE", "AT", "NL", "ES"],
    // A kvóta nincs publikálva — ezért nem írunk ide számot, csak
    // konzervatívan throttle-özünk.
    rateLimit: null,
    cacheTtlMinutes: 360,
    regions: "Magyarország + DACH/Benelux/ES (locale-onként)",
    docs: "https://www.careerjet.com/partners/api",
    warning:
      "A user_ip és user_agent kötelező. Az országot a locale_code dönti el, nem a location — rossz locale üres eredményt ad, nem hibát. A Jooble tartaléka HU-ra.",
    fallbackFor: [BACKS_UP],
  },
  async fetch(params, signal) {
    if (jobsEnv("CAREERJET_LIVE") !== "1") {
      throw new SourceError(
        "Az élő hívás ki van kapcsolva. Bekapcsolás: CAREERJET_LIVE=1.",
        "config",
      );
    }

    const key = jobsEnv("CAREERJET_KEY");
    if (!key) throw new SourceError("Hiányzó CAREERJET_KEY", "config");

    // Kötelező mezők, konfigból. Szerveroldali batchnél a saját szerver
    // IP-je és egy értelmes UA a helyes válasz — nem beégetett érték.
    const userIp = jobsEnv("CAREERJET_USER_IP");
    const userAgent =
      jobsEnv("CAREERJET_USER_AGENT") ??
      "Mozilla/5.0 (compatible; JobRadar/1.0)";
    if (!userIp) {
      throw new SourceError(
        "Hiányzó CAREERJET_USER_IP — az API kötelezően kéri. Add meg a szervered publikus IP-jét.",
        "config",
      );
    }

    // A Basic auth jelszava ÜRES, de a kettőspont kell.
    const auth = "Basic " + Buffer.from(`${key}:`).toString("base64");

    // Ha a Jooble elfogyott vagy elromlott, a magyar locale-t előre vesszük,
    // hogy a szűk időkeretből biztosan jusson rá.
    const locales = configuredLocales();
    const ordered = isAlerting(BACKS_UP)
      ? ["hu_HU", ...locales.filter((l) => l !== "hu_HU")]
      : locales;

    const jobs: Job[] = [];
    for (const [i, locale] of ordered.entries()) {
      const qs = new URLSearchParams({
        locale_code: locale,
        keywords: params.q || "fejlesztő",
        page_size: String(PAGE_SIZE),
        sort: "date",
        user_ip: userIp,
        user_agent: userAgent,
      });
      const location = jobsEnv("CAREERJET_LOCATION");
      if (location) qs.set("location", location);

      try {
        const data = await getJson<{ jobs?: CareerjetJob[] }>(`${API}?${qs}`, {
          signal,
          timeoutMs: TIMEOUT,
          headers: { Authorization: auth },
          retries: 0,
        });
        jobs.push(...(data.jobs ?? []).map((j) => toJob(j, locale)));
      } catch {
        // Egy locale hibája ne vigye el a többit — a rossz locale amúgy is
        // csak üres eredményt ad, nem hibát.
      }

      // Ismeretlen rate limit → konzervatív throttle.
      if (i < ordered.length - 1) await sleep(THROTTLE_MS);
    }

    return jobs;
  },
});
