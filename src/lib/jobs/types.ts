/**
 * Közös alap: Job séma + adapter interfész.
 *
 * Minden forrás erre a sémára normalizál, így a dedup és a megjelenítés
 * forrásfüggetlen marad. Ebben a fájlban nincs szerveroldali import: a
 * kliens komponensek is innen veszik a típusokat és a kanban oszlopait.
 */

/** Az állás, ahogy a böngészőbe megy és a táblán tárolódik: nyers forrás nélkül. */
export type BoardJob = Omit<Job, "raw">;

/** A kanban tábla egy sora. */
export interface BoardItem {
  status: BoardStatus;
  job: BoardJob;
}

export type BoardStatus =
  "new" | "shortlist" | "applied" | "replied" | "interview" | "rejected";

export const BOARD_COLUMNS: { id: BoardStatus; label: string }[] = [
  { id: "new", label: "Új" },
  { id: "shortlist", label: "Shortlist" },
  { id: "applied", label: "Jelentkeztem" },
  { id: "replied", label: "Válasz jött" },
  { id: "interview", label: "Interjú" },
  { id: "rejected", label: "Lezárva" },
];

export type SalaryPeriod = "year" | "month" | "hour";

export interface Job {
  /** Forrás azonosító — mindig egyenlő a SourceMeta.id-vel. */
  sourceId: string;
  /** A forrás saját ID-ja. A (sourceId, externalId) pár azonosít egy hirdetést. */
  externalId: string;
  /** sha1(normalizedCompany|normalizedTitle|country), 16 hex karakterre vágva. */
  dedupKey: string;
  title: string;
  company: string;
  /** Céges domain, ha kinyerhető. A későbbi Hunter.io-dúsításhoz kell. */
  companyDomain?: string;
  /**
   * KÖZVETLEN jelentkezési e-mail cím, ha a hirdetés megadja.
   *
   * A HN „Who is hiring" kommentek ötödében ott van — és ha megvan, a
   * Hunter.io-lépés (23-as task) KIHAGYHATÓ erre a hirdetésre: kreditet
   * spórol, és közvetlenül az emberhez visz, nem egy ATS-be.
   */
  applyEmail?: string;
  url: string;
  /** Nyers lokáció szöveg, ahogy a forrás adta. */
  location?: string;
  /** ISO-3166-1 alpha-2, normalizálva. Az ELSŐDLEGES lokáció országa. */
  country?: string;
  /**
   * További országok, ahol ugyanez a pozíció nyitva van (ISO-2).
   *
   * Több forrás egy hirdetéshez több helyszínt ad (Ashby `secondaryLocations`),
   * és a valódi EU-lehetőség gyakran ITT van, miközben az elsődleges lokáció
   * amerikai. Az országszűrő ezt is nézi, különben pont ezek esnének ki.
   */
  alsoCountries?: string[];
  remote: boolean;
  /** Plain text, HTML-től megtisztítva (stripHtml). */
  description?: string;
  salaryMin?: number;
  salaryMax?: number;
  /** ISO-4217. */
  currency?: string;
  salaryPeriod?: SalaryPeriod;
  /**
   * Igaz, ha a fizetés a FORRÁS BECSLÉSE, nem a hirdetésé.
   *
   * Az Adzuna `salary_is_predicted: "1"` mezője ilyen. Tényként kezelve
   * hamis képet ad a piacról — a UI is külön jelöli, és az Adzuna ToS-e
   * megköveteli az "Adzuna Jobsworth" jelölést a becsléseknél.
   */
  salaryIsEstimate?: boolean;
  /**
   * Bizalmas hirdetés: a cégnév rejtve van (Workable `confidential`).
   *
   * A Hunter.io-dúsítás ezeket kihagyja — nincs mihez domaint keresni.
   */
  confidential?: boolean;
  seniority?: string;
  employmentType?: string;
  /**
   * Heti óraszám, ha a forrás megadja (Recruitee `min_hours`/`max_hours`).
   *
   * A holland piacon a 32 órás hét gyakori, és a hirdetésből ez másképp nem
   * derül ki — teljes állást keresve ez valódi szűrő.
   */
  minHours?: number;
  maxHours?: number;
  /**
   * Megengedett UTC-eltolások, ha a forrás korlátozza (Himalayas
   * `timezoneRestrictions`). Üres/hiányzó = nincs korlátozás.
   *
   * CET-ből (UTC+1/+2) egy [-10..-5] listájú pozíció nem reális — ezt a
   * scoring használja, és a kártya is jelzi.
   */
  timezones?: number[];
  /** ISO-8601. Opcionális: több forrás egyszerűen nem ad dátumot. */
  postedAt?: string;
  /** ISO-8601. */
  expiresAt?: string;
  tags?: string[];
  /** Ha több forrás is hozta ugyanezt, itt látszik, melyek. Dedup tölti. */
  alsoFrom?: string[];
  /**
   * A nyers forrásobjektum, változtatás nélkül.
   *
   * Ez teszi lehetővé, hogy egy forrás sémaváltása után visszamenőleg
   * újraparse-oljunk anélkül, hogy újra le kellene húzni mindent.
   * Szerveroldali mező: a /api/search alapból NEM küldi ki (nagy, és a
   * böngészőnek nem kell) — `?includeRaw=1` kapcsolóval kérhető.
   */
  raw: unknown;
}

/** A Job azon mezői, amelyek nélkül a rekord használhatatlan. */
export const REQUIRED_JOB_FIELDS = [
  "sourceId",
  "externalId",
  "dedupKey",
  "title",
  "company",
  "url",
] as const satisfies readonly (keyof Job)[];

export type SourceCategory = "ats" | "remote" | "aggregator" | "gov";

/** A forrás publikált kerete. Ami nincs megadva, arra nincs ismert korlát. */
export interface RateLimit {
  perMinute?: number;
  perHour?: number;
  perDay?: number;
  perMonth?: number;
  /** Teljes élettartamra szóló keret (Jooble: 500 hívás a kulcs életében). */
  lifetime?: number;
}

export interface SourceMeta {
  id: string;
  name: string;
  category: SourceCategory;
  /** 'none' = kulcs nélkül · 'fixed' = publikus megosztott kulcs · 'key' = saját kulcs kell */
  auth: "none" | "fixed" | "key";
  /** Ha meg van adva és nincs beállítva env-ben, a forrás kimarad. */
  envKeys?: string[];
  /** Emberi olvasásra, a UI ezt írja ki. */
  regions: string;
  /** Gépi feldolgozásra: ISO-2 kódok, vagy 'global'. */
  regionCodes: string[];
  /** Publikált keret, vagy null, ha nincs ismert korlát. */
  rateLimit: RateLimit | null;
  /** Mennyi ideig ne kérdezzük újra. A cache-réteg (38-as task) ezt olvassa. */
  cacheTtlMinutes: number;
  docs: string;
  warning?: string;
  /**
   * Kötelező forrásmegjelölés, ha az eredményt PUBLIKÁLOD.
   *
   * A RemoteOK ToS-e follow-linket és névemlítést ír elő, különben
   * felfüggesztik a hozzáférést. Belső, saját használatú keresésnél ez nem
   * alkalmazandó — de a mező itt van, hogy publikáláskor ne kelljen keresni.
   */
  attribution?: { label: string; url: string };
  /**
   * Mely forrásoknak a tartaléka ez.
   *
   * Ha a megnevezett forrás riasztó állapotba kerül (health.ts), ez a forrás
   * mélyebben kérdez le, hogy pótolja a kiesést — és a UI is megmutatja,
   * ki fedezi a halott forrást.
   */
  fallbackFor?: string[];
}

/** A forráskatalógus egy sora: a forrás leírása és hogy fut-e. */
export interface CatalogSource extends SourceMeta {
  /** Minden szükséges beállítása megvan. */
  enabled: boolean;
  /** A hiányzó beállítások NEVEI — az értékük soha nem megy ki. */
  missingEnv: string[];
}

export interface SearchParams {
  q: string;
  countries?: string[];
  remoteOnly?: boolean;
  limit: number;
}

/** Amit egy adapter a találatok mellé kötelezően visszaad. */
export interface SourceFetchMeta {
  /** Mikor jött a válasz (ISO-8601). A cache-réteg innen számol TTL-t. */
  fetchedAt: string;
  /** A forrás id-ja — a hívó ebből is látja, ki válaszolt. */
  source: string;
  /** Hány rekordot adott a forrás, MIELŐTT a séma-validáció eldobott volna bármit. */
  rawCount: number;
  /** Hány rekord esett ki kötelező mező hiánya miatt. */
  dropped: number;
}

export interface SourceResult {
  jobs: Job[];
  meta: SourceFetchMeta;
}

export interface JobSource {
  meta: SourceMeta;
  fetchJobs(params: SearchParams, signal: AbortSignal): Promise<SourceResult>;
}

export interface SourceRunResult {
  sourceId: string;
  name: string;
  category: SourceCategory;
  ok: boolean;
  count: number;
  durationMs: number;
  error?: string;
  /** A hiba tipizálása, ha volt: 'unavailable' | 'timeout' | 'parse' | 'config'. */
  errorKind?: string;
  skipped?: boolean;
  /**
   * Igaz, ha a forrás ALERT_AFTER egymást követő futáson hibázott.
   * Ez már nem múló hiba, hanem valószínűleg megszűnt vagy megváltozott API.
   */
  alert?: boolean;
  /** Hány egymást követő futás hibázott eddig. */
  consecutiveFailures?: number;
  /** Hány rekordot adott a forrás, szűrés előtt. */
  rawCount?: number;
  /** Hány rekord esett ki séma-validáción. */
  dropped?: number;
  fetchedAt?: string;
  warning?: string;
  docs: string;
}

export interface SearchResponse {
  query: string;
  jobs: Job[];
  sources: SourceRunResult[];
  totalRaw: number;
  totalUnique: number;
  durationMs: number;
}
