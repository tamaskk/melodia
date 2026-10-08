import { jobsEnv } from "./env";
import { createHash } from "node:crypto";
import { REQUIRED_JOB_FIELDS, type Job } from "./types";

function unescapeEntities(s: string): string {
  return (
    s
      // SZÁMOS entitások: &#x2F; (hex) és &#47; (decimális). A HN ezeket
      // használja a perjelre, és nélkülük "&#x2F;" marad a címekben.
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
        String.fromCodePoint(parseInt(hex, 16)),
      )
      .replace(/&#(\d+);/g, (_, dec: string) =>
        String.fromCodePoint(Number(dec)),
      )
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
  );
}

/**
 * HTML entitások + tagek kiszedése.
 *
 * A Greenhouse `content` mezője DUPLA escape-elt (`&amp;amp;`), ezért az
 * entitásokat ciklusban oldjuk fel, amíg változik a szöveg. Egy menet
 * `&amp;`-et hagyna a kimenetben.
 */
export function stripHtml(input?: string | null): string | undefined {
  if (!input) return undefined;

  let unescaped = input;
  for (let i = 0; i < 3; i++) {
    const next = unescapeEntities(unescaped);
    if (next === unescaped) break;
    unescaped = next;
  }

  const text = unescaped
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    // A bekezdés NYITÓTAGJA is sortörés. Enélkül a HN-kommentek fejléce és
    // törzse egyetlen sorba olvad, és a "Cég | Pozíció | Lokáció" fejléc
    // utolsó mezőjébe belefolyik a teljes szöveg.
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<\/(p|li|div|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    // A tagek helyére tett szóköz sortörés mellett behúzásnak látszik
    // ("Aufgaben\n Du entwickelst") — a sorok elejéről/végéről szedjük le.
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || undefined;
}

function deaccent(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Cégnév normalizálása dedup-hoz: kisbetű, ékezet le, jogi forma le. */
export function normalizeCompany(name: string): string {
  return deaccent(name.toLowerCase())
    .replace(
      /\b(kft|zrt|bt|nyrt|gmbh|ag|ug|bv|nv|ltd|limited|llc|inc|corp|corporation|sa|srl|oy|ab|as)\b\.?/g,
      "",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Álláscím normalizálása. A zaj kiszedése kritikus: a német "(m/w/d)" és a
 * "- Remote" utótagok miatt ugyanaz a pozíció két forrásból sosem egyezne.
 */
export function normalizeTitle(title: string): string {
  return deaccent(title.toLowerCase())
    .replace(/\((m\/w\/d|m\/f\/d|w\/m\/d|h\/f|m\/v)\)/g, "")
    .replace(/\b(m\/w\/d|m\/f\/d|f\/m\/d|w\/m\/x)\b/g, "")
    .replace(
      /[-–|,(]\s*(remote|hybrid|onsite|full[- ]time|part[- ]time|100% remote)[^a-z0-9]*$/g,
      "",
    )
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}

export function buildDedupKey(
  company: string,
  title: string,
  country?: string,
): string {
  const basis = `${normalizeCompany(company)}|${normalizeTitle(title)}|${(country ?? "").toLowerCase()}`;
  return createHash("sha1").update(basis).digest("hex").slice(0, 16);
}

const COUNTRY_MAP: Record<string, string> = {
  hungary: "HU",
  magyarorszag: "HU",
  magyarország: "HU",
  budapest: "HU",
  ungarn: "HU",
  germany: "DE",
  deutschland: "DE",
  berlin: "DE",
  munich: "DE",
  münchen: "DE",
  hamburg: "DE",
  cologne: "DE",
  frankfurt: "DE",
  stuttgart: "DE",
  austria: "AT",
  osterreich: "AT",
  österreich: "AT",
  vienna: "AT",
  wien: "AT",
  graz: "AT",
  salzburg: "AT",
  linz: "AT",
  innsbruck: "AT",
  klagenfurt: "AT",
  switzerland: "CH",
  schweiz: "CH",
  zurich: "CH",
  zürich: "CH",
  basel: "CH",
  bern: "CH",
  geneva: "CH",
  genf: "CH",
  lausanne: "CH",
  luzern: "CH",
  lugano: "CH",
  zug: "CH",
  netherlands: "NL",
  nederland: "NL",
  holland: "NL",
  amsterdam: "NL",
  rotterdam: "NL",
  utrecht: "NL",
  eindhoven: "NL",
  "the hague": "NL",
  spain: "ES",
  espana: "ES",
  españa: "ES",
  madrid: "ES",
  barcelona: "ES",
  valencia: "ES",
  "united kingdom": "GB",
  uk: "GB",
  england: "GB",
  london: "GB",
  manchester: "GB",
  "united states": "US",
  usa: "US",
  "u.s.": "US",
  "new york": "US",
  "san francisco": "US",
  poland: "PL",
  warsaw: "PL",
  krakow: "PL",
  czechia: "CZ",
  "czech republic": "CZ",
  prague: "CZ",
  romania: "RO",
  bucharest: "RO",
  portugal: "PT",
  lisbon: "PT",
  france: "FR",
  paris: "FR",
  italy: "IT",
  milan: "IT",
  ireland: "IE",
  dublin: "IE",
  belgium: "BE",
  brussels: "BE",
  sweden: "SE",
  stockholm: "SE",
  denmark: "DK",
  copenhagen: "DK",
  norway: "NO",
  oslo: "NO",
  finland: "FI",
  helsinki: "FI",
  // A Jobicy jobGeo-ja teljes országneveket sorol fel — ezek nélkül a
  // "Austria, Croatia, Germany, Hungary, …" felsorolás fele elveszne.
  croatia: "HR",
  zagreb: "HR",
  bulgaria: "BG",
  sofia: "BG",
  ukraine: "UA",
  kyiv: "UA",
  greece: "GR",
  athens: "GR",
  slovakia: "SK",
  bratislava: "SK",
  slovenia: "SI",
  ljubljana: "SI",
  estonia: "EE",
  tallinn: "EE",
  latvia: "LV",
  riga: "LV",
  lithuania: "LT",
  vilnius: "LT",
  serbia: "RS",
  belgrade: "RS",
  turkey: "TR",
  istanbul: "TR",
  luxembourg: "LU",
  iceland: "IS",
  malta: "MT",
  cyprus: "CY",
  canada: "CA",
  toronto: "CA",
  vancouver: "CA",
};

/** Szabadszöveges lokációból ISO-2 országkód, ahol felismerhető. */
export function guessCountry(location?: string | null): string | undefined {
  if (!location) return undefined;
  const lower = deaccent(location.toLowerCase()).trim();

  // ELŐSZÖR pontos egyezés. Enélkül a kétbetűs ág elnyelné az "UK"-t és
  // "UK"-t adna vissza — pedig az ISO-3166-1 alpha-2 kód "GB".
  const exact = COUNTRY_MAP[lower];
  if (exact) return exact;

  if (/^[a-z]{2}$/.test(lower)) return lower.toUpperCase();
  for (const [needle, code] of Object.entries(COUNTRY_MAP)) {
    if (lower.includes(deaccent(needle))) return code;
  }
  return undefined;
}

const REMOTE_RE =
  /\b(remote|távmunka|tavmunka|home\s*office|homeoffice|work from home|anywhere|worldwide|distributed)\b/i;

export function looksRemote(...fields: (string | undefined | null)[]): boolean {
  return fields.some((f) => (f ? REMOTE_RE.test(f) : false));
}

/**
 * Német↔angol szakmai szinonimák a keresőhöz.
 *
 * A Personio-feed (DACH) leírásai és címei németül vannak. Fordítás helyett a
 * KERESŐT tanítjuk meg németül: aki "developer"-re keres, az "Entwickler"
 * hirdetéseket is megtalálja, és fordítva. Ez olcsó, determinisztikus és
 * offline — az LLM-es fordítás a 21-es task dolga, nem ezé.
 *
 * A kulcsok és az értékek is ékezet nélküli kisbetűs alakban vannak, mert a
 * matchesQuery deaccentelt szövegen dolgozik.
 */
const SYNONYMS: Record<string, string[]> = {
  developer: ["entwickler", "entwicklerin", "fejleszto"],
  entwickler: ["developer", "fejleszto"],
  engineer: ["ingenieur", "entwickler", "mernok"],
  software: ["softwareentwickler", "softwareentwicklung"],
  frontend: ["frontendentwickler"],
  backend: ["backendentwickler"],
  fullstack: ["full stack", "fullstackentwickler"],
  designer: ["gestalter"],
  manager: ["leiter", "leitung"],
  lead: ["leiter", "leitung"],
  senior: ["erfahren", "experienced"],
  junior: ["einsteiger", "berufseinsteiger"],
  intern: ["praktikant", "praktikum", "werkstudent", "gyakornok"],
  data: ["daten"],
  scientist: ["wissenschaftler"],
  analyst: ["analytiker"],
  security: ["sicherheit"],
  sales: ["vertrieb"],
  marketing: ["marketing"],
  support: ["betreuung", "kundenservice"],
  tester: ["testerin", "qualitatssicherung"],
  architect: ["architekt"],
  administrator: ["administratorin", "systemadministrator"],
  consultant: ["berater", "beraterin"],
  remote: ["homeoffice", "telearbeit", "tavmunka"],
};

/** Egy keresőszó összes elfogadott alakja (önmagát is beleértve). */
function variants(word: string): string[] {
  return [word, ...(SYNONYMS[word] ?? []).map(deaccent)];
}

/**
 * Szerveroldali szűrés. Az ATS-források (Greenhouse, Lever…) nem tudnak keresni —
 * mindent visszaadnak, és itt szűrjük. Minden szó szerepeljen valahol.
 *
 * A szavakra szinonimákat is elfogadunk (lásd SYNONYMS), az idézőjeles
 * kifejezésekre NEM: aki idézőjelet tesz, pontosan azt akarja.
 */
export function matchesQuery(job: Job, q: string): boolean {
  if (!q.trim()) return true;
  const hay = deaccent(
    [
      job.title,
      job.company,
      job.location,
      job.description?.slice(0, 3000),
      job.tags?.join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  );
  const phrases =
    q
      .toLowerCase()
      .match(/"[^"]+"/g)
      ?.map((p) => p.slice(1, -1)) ?? [];
  const rest = q.toLowerCase().replace(/"[^"]+"/g, " ");
  const words = rest.split(/\s+/).filter(Boolean);
  return (
    phrases.every((p) => hay.includes(deaccent(p))) &&
    words.every((w) => variants(deaccent(w)).some((v) => hay.includes(v)))
  );
}

/** Legfrissebb nyer; a többi forrás azonosítója az alsoFrom-ba kerül. */
export function dedupe(jobs: Job[]): Job[] {
  const byKey = new Map<string, Job>();
  for (const job of jobs) {
    const existing = byKey.get(job.dedupKey);
    if (!existing) {
      byKey.set(job.dedupKey, { ...job, alsoFrom: [] });
      continue;
    }
    if (
      existing.sourceId !== job.sourceId &&
      !existing.alsoFrom!.includes(job.sourceId)
    ) {
      existing.alsoFrom!.push(job.sourceId);
    }
    // A gazdagabb rekordot tartjuk meg (leírás, fizetés).
    const better =
      (job.description?.length ?? 0) > (existing.description?.length ?? 0) ||
      (job.salaryMin && !existing.salaryMin);
    if (better) {
      byKey.set(job.dedupKey, { ...job, alsoFrom: existing.alsoFrom });
    }
  }
  return [...byKey.values()];
}

export function toISO(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") {
    // Másodperc vagy milliszekundum? 1e12 alatt másodpercnek vesszük.
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}

export function num(value: unknown): number | undefined {
  const n =
    typeof value === "string"
      ? parseFloat(value.replace(/[^\d.-]/g, ""))
      : value;
  return typeof n === "number" && isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Séma-validáció: mely kötelező mezők hiányoznak.
 *
 * Egy forrás sémaváltása nem dobhatja el az egész futást — a hiányos rekordot
 * eldobjuk, megszámoljuk (SourceFetchMeta.dropped), és megyünk tovább.
 */
export function missingRequiredFields(job: Partial<Job>): string[] {
  return REQUIRED_JOB_FIELDS.filter((f) => {
    const v = job[f];
    return typeof v !== "string" || v.trim() === "";
  });
}

export function isValidJob(job: Partial<Job>): job is Job {
  return missingRequiredFields(job).length === 0;
}

/**
 * Régiónevek, amik lefedik Európát (és így Magyarországot is).
 *
 * Három remote forrás ad vesszős lokáció-korlátozást szabadszövegben
 * (Himalayas `locationRestrictions`, Remotive `candidate_required_location`,
 * Working Nomads `location`). Mind ugyanazt a kérdést válaszolja meg:
 * INNEN lehet-e egyáltalán jelentkezni.
 */
const REGION_COVERS_EU =
  /^(worldwide|anywhere|anywhere in the world|global|europe|european union|eu|emea|eea|european timezones)$/i;

/**
 * Elérhető-e a pozíció a megadott országokból.
 *
 * Üres korlátozás = bárhonnan. A régiónevek („Europe", „EMEA") lefedik az
 * EU-t; a konkrét országneveket a guessCountry oldja fel.
 */
export function isReachableFrom(
  restrictions: string[] | string | undefined | null,
  eligible: string[],
): boolean {
  const list = Array.isArray(restrictions)
    ? restrictions
    : typeof restrictions === "string"
      ? restrictions.split(",")
      : [];
  const parts = list.map((r) => String(r).trim()).filter(Boolean);
  if (!parts.length) return true;

  return parts.some((part) => {
    if (REGION_COVERS_EU.test(part)) return true;
    const code = guessCountry(part);
    return code ? eligible.includes(code) : false;
  });
}

/** Az alapértelmezett célországok — a remote források szűrésének alapja. */
export const DEFAULT_ELIGIBLE_COUNTRIES = [
  "HU",
  "DE",
  "AT",
  "NL",
  "ES",
  "GB",
  "PL",
  "CZ",
  "RO",
  "PT",
  "IE",
  "SE",
  "DK",
  "FR",
  "IT",
  "CH",
  "BE",
];

/** Konfigurálható célország-lista. */
export function eligibleCountries(
  envVar = "REMOTE_ELIGIBLE_COUNTRIES",
): string[] {
  const raw = jobsEnv(envVar);
  if (!raw) return DEFAULT_ELIGIBLE_COUNTRIES;
  return raw
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}
