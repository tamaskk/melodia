/**
 * RemoteOK — egyetlen GET, teljes hirdetéslista.
 * https://remoteok.com/api (önmagát dokumentálja)
 *
 * KÉT CSAPDA, amire a task figyelmeztet:
 *
 * 1. A tömb ELSŐ eleme jogi közlemény, nem állás. Élőben ellenőrizve: csak
 *    ezen az egy elemen van `legal` mező, és nincs rajta `position`. Ezért
 *    kétszeresen védekezünk: slice(1) ÉS a `legal`/cím nélküli elemek
 *    kiszűrése — így egy jövőbeli sorrendváltozás sem enged szemetet be.
 *
 * 2. "Alapértelmezett User-Agent esetén 403." — 2026-09-01-én MÉRVE ez már
 *    NEM reprodukálható: UA nélkül, curl-ös és leíró UA-val is 200 jön,
 *    bájtra azonos válasszal. A leíró UA-t ettől függetlenül küldjük (a
 *    közös http.ts teszi): a viselkedés bármikor visszatérhet, és illik is.
 *
 * ⚠️ ToS: PUBLIKÁLÁSKOR kötelező a follow-link és a "Remote OK" névemlítés,
 * különben felfüggesztik a hozzáférést. A logó védjegyzett, nem használható.
 * Belső, saját álláskeresésnél nem alkalmazandó — a meta.attribution mező
 * viszont készen áll, és a UI ki is teszi.
 */
import { getJson } from "../http";
import { num, stripHtml, toISO } from "../normalize";
import { defineSource, makeJob as mk } from "./base";
import type { Job } from "../types";

const API = "https://remoteok.com/api";
const TIMEOUT = 15000;

/**
 * A `salary_min` mezőben 0 és irreálisan kicsi értékek is előfordulnak
 * (élőben látott minta: 30). A 0-t a `num()` amúgy is eldobja; ez a küszöb
 * a "30 USD/év" jellegű képtelenségek ellen véd. Inkább ne mutassunk
 * fizetést, mint hamisat.
 */
const MIN_PLAUSIBLE_ANNUAL_USD = 1000;

export interface RemoteOkEntry {
  /** CSAK a jogi közleményen van. */
  legal?: string;
  id?: string | number;
  slug?: string;
  epoch?: number;
  date?: string;
  company?: string;
  company_logo?: string;
  /** A CÍM MEZŐJE — nem `title`. */
  position?: string;
  tags?: string[];
  description?: string;
  /** Város, gyakran lezáró vesszővel ("Ludhiana, "), vagy üres. */
  location?: string;
  apply_url?: string;
  url?: string;
  /** USD, éves. 0 = nincs adat. */
  salary_min?: number;
  salary_max?: number;
}

/**
 * A valódi állások kiválogatása a nyers válaszból.
 *
 * Exportált és külön tesztelt: ha ez valaha visszacsúszik, minden futásnál
 * egy szemét rekord kerül a pipeline-ba.
 */
export function stripLegalEntry(raw: unknown): RemoteOkEntry[] {
  if (!Array.isArray(raw)) return [];
  return (
    (raw as RemoteOkEntry[])
      // 1. az első elem a jogi közlemény
      .slice(1)
      // 2. öv és nadrágtartó: bármi, aminek `legal` mezője van vagy nincs címe,
      //    nem állás — a sorrendtől függetlenül
      .filter((e) => e && !e.legal && Boolean(e.position))
  );
}

function plausibleSalary(value: unknown): number | undefined {
  const n = num(value);
  return n && n >= MIN_PLAUSIBLE_ANNUAL_USD ? n : undefined;
}

/**
 * Egy RemoteOK hirdetés → közös Job séma.
 * Exportált, mert a test/remoteok.test.ts a mentett fixture-ön ellenőrzi.
 */
export function toJob(e: RemoteOkEntry): Job {
  const min = plausibleSalary(e.salary_min);
  const max = plausibleSalary(e.salary_max);

  return mk({
    sourceId: "remoteok",
    raw: e,
    externalId: String(e.id ?? e.slug ?? ""),
    // A cím mezője `position`, nem `title`.
    title: String(e.position ?? ""),
    company: String(e.company ?? ""),
    url: e.apply_url ?? e.url ?? "",
    // A lezáró vessző a forrás adatában van ("Ludhiana, ") — leszedjük.
    location: e.location?.replace(/[\s,]+$/, "") || undefined,
    // SZÁNDÉKOSAN nincs ország. A RemoteOK minden hirdetése távmunka, a
    // `location` pedig kontextus nélküli városnév ("Valencia" — spanyol vagy
    // venezuelai?). Inkább üres, mint találgatott és néha rossz országkód.
    // Következmény: országszűrővel a RemoteOK találatai kiesnek.
    country: undefined,
    remote: true,
    description: stripHtml(e.description),
    salaryMin: min,
    salaryMax: max,
    // A forrás dokumentáltan USD-ben, éves összeget ad.
    currency: min || max ? "USD" : undefined,
    salaryPeriod: min || max ? "year" : undefined,
    postedAt: toISO(e.date ?? e.epoch),
    tags: Array.isArray(e.tags) ? e.tags.map(String) : undefined,
  });
}

export const remoteok = defineSource({
  meta: {
    id: "remoteok",
    name: "RemoteOK",
    category: "remote",
    auth: "none",
    regionCodes: ["global"],
    rateLimit: null,
    cacheTtlMinutes: 240,
    regions: "Globális remote",
    docs: "https://remoteok.com/api",
    warning:
      'Publikáláskor KÖTELEZŐ a follow-link és a "Remote OK" névemlítés. Nincs országadat: minden hirdetése távmunka.',
    attribution: { label: "Remote OK", url: "https://remoteok.com" },
  },
  async fetch(_params, signal) {
    const raw = await getJson<unknown>(API, { signal, timeoutMs: TIMEOUT });
    return stripLegalEntry(raw).map(toJob);
  },
});
