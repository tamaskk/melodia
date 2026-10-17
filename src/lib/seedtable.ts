/**
 * Cégek importja a Seedtable API-ból (https://seedtable.com/developers).
 *
 * Menet: a `/companies` végpontot lapozzuk a megadott szűrőkkel, a sorokat a
 * rendes import-ellenőrzésen (`parseImport`) visszük át, kiszűrjük, ami már
 * bent van (`splitKnown`), és csak az újakat mentjük. Kérésre az új cégekhez
 * döntéshozót is keresünk (`/people`), hogy legyen kinek írni.
 *
 * Minden hívás a Seedtable kvótájából megy (ingyenes kulccsal 100/hó), ezért
 * az előnézet csak a cégeket kéri le, a személykeresés a mentéskor fut.
 */
import { rescore, upsertContacts } from "./contacts";
import { toCountryCode } from "./countries";
import { buildCompanyLetter, toSizeBucket } from "./csvImport";
import { credential } from "./env";
import { splitKnown } from "./importDedupe";
import { parseImport, type ImportRow } from "./importSchema";
import { createLogger } from "./logger";
import type { Contact, SeedtableInfo } from "./types";

const log = createLogger("seedtable");

const BASE = "https://seedtable.com/api/v1";
/** A Seedtable egy oldalon legfeljebb ennyit ad. */
const PAGE_SIZE = 100;
/** Egy futás felső határa — a kérésnek a Vercel 300 mp-es keretébe kell férnie. */
export const MAX_COMPANIES = 500;

export const FUNDING_STAGES = [
  "pre_seed",
  "seed",
  "series_a",
  "series_b",
  "series_c",
  "series_d",
  "series_e",
  "series_f",
  "series_g",
  "series_h",
  "series_i",
  "series_j",
  "growth",
  "debt",
  "grant",
  "ipo",
  "acquired",
  "other",
] as const;

export const PEOPLE_ROLES = [
  "founder",
  "ceo",
  "cto",
  "cfo",
  "coo",
  "cpo",
  "cmo",
  "cro",
  "executive",
  "vp_engineering",
  "vp_sales",
  "vp_marketing",
  "vp",
  "head_of_product",
  "director",
  "manager",
  "other",
] as const;

export const SORT_FIELDS = [
  "name",
  "score",
  "createdAt",
  "updatedAt",
  "employeeCount",
  "totalFunding",
  "foundedYear",
] as const;

type FilterKind = "text" | "number" | "boolean" | "date" | "enum";

/** A `/companies` szűrői: név → típus (és enumnál a megengedett értékek). */
export const COMPANY_FILTERS: Record<
  string,
  { kind: FilterKind; values?: readonly string[]; repeat?: boolean }
> = {
  q: { kind: "text" },
  country: { kind: "text" },
  city: { kind: "text" },
  industry: { kind: "text" },
  category: { kind: "text" },
  hq_country: { kind: "text" },
  hq_region: { kind: "text" },
  hq_city: { kind: "text" },
  hq_continent: { kind: "text" },
  funding_stage: { kind: "enum", values: FUNDING_STAGES, repeat: true },
  min_score: { kind: "number" },
  max_score: { kind: "number" },
  min_employees: { kind: "number" },
  max_employees: { kind: "number" },
  min_raised: { kind: "number" },
  max_raised: { kind: "number" },
  raised_within: { kind: "number" },
  raised_after: { kind: "date" },
  raised_before: { kind: "date" },
  likely_to_hire: { kind: "boolean" },
  likely_to_outsource: { kind: "boolean" },
  bootstrapped: { kind: "boolean" },
  uses_technology: { kind: "text" },
  uses_supplier: { kind: "text" },
  uses_product: { kind: "text" },
  include: { kind: "enum", values: ["startups", "all"] },
  sort_by: { kind: "enum", values: SORT_FIELDS },
  sort_order: { kind: "enum", values: ["asc", "desc"] },
};

export interface SeedtableCompany {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  industry: string | null;
  employeeCount: number | null;
  foundedYear: number | null;
  status: string | null;
  fundingStage: string | null;
  totalFunding: number | null;
  lastFundingAmount: number | null;
  lastFundingDate: string | null;
  score: number | null;
  likelyToHire: boolean | null;
  likelyToOutsource: boolean | null;
  tags: string[] | null;
}

/** A Seedtable-adatlap mentendő alakja. */
function seedtableInfo(company: SeedtableCompany, now: string): SeedtableInfo {
  return {
    id: company.id,
    slug: company.slug,
    url: `https://seedtable.com/companies/${company.slug}`,
    description: company.description,
    industry: company.industry,
    employeeCount: company.employeeCount,
    foundedYear: company.foundedYear,
    status: company.status,
    fundingStage: company.fundingStage,
    totalFunding: company.totalFunding,
    lastFundingAmount: company.lastFundingAmount,
    lastFundingDate: company.lastFundingDate,
    score: company.score,
    likelyToHire: company.likelyToHire,
    likelyToOutsource: company.likelyToOutsource,
    tags: company.tags ?? [],
    importedAt: now,
  };
}

/** Bevont tőke sávja címkének: így a Kontaktok szűrőjében is kereshető. */
function fundingBand(total: number | null): string | null {
  if (!total) return null;
  if (total < 1_000_000) return "toke-1m-alatt";
  if (total < 10_000_000) return "toke-1-10m";
  if (total < 50_000_000) return "toke-10-50m";
  if (total < 200_000_000) return "toke-50-200m";
  return "toke-200m-felett";
}

interface SeedtablePerson {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email?: string | null;
  inferredEmail?: string | null;
  inferredEmailConfidence?: string | null;
  linkedin: string | null;
}

interface Page<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PeopleOptions {
  /** Keressünk-e döntéshozót az új cégekhez (cégenként egy hívás). */
  enabled: boolean;
  roles: string[];
  decisionMakersOnly: boolean;
  /** A „low” bizonyosságú, kikövetkeztetett címet is elfogadjuk-e. */
  allowLowConfidence: boolean;
}

export interface SeedtableRequest {
  filters: Record<string, string | string[]>;
  /** Legfeljebb ennyi céget kérünk le. */
  max: number;
  /** Ennyi találatot ugrunk át a lista elejéről — így folytatható a következő adag. */
  offset: number;
  people: PeopleOptions;
  /** Hamis: csak előnézet, semmit nem ment. */
  apply: boolean;
}

export interface ResultRow {
  seedtableId: string;
  company: string;
  country: string;
  city: string | null;
  website: string | null;
  industry: string | null;
  employees: number | null;
  stage: string | null;
  score: number | null;
  status: "uj" | "mar-bent" | "hibas";
  /** Már bentnél: mi alapján és melyik sorral egyezik; hibásnál az ok. */
  detail: string | null;
  person: string | null;
  email: string | null;
}

export interface SeedtableResult {
  apply: boolean;
  /** Ennyi cég felel meg a szűrőknek a Seedtable szerint. */
  available: number;
  /** Ahonnan ez a futás indult, és ahonnan a következő folytathatja (null: a lista végére értünk). */
  offset: number;
  nextOffset: number | null;
  fetched: number;
  fresh: number;
  known: number;
  invalid: number;
  saved: number;
  withEmail: number;
  /** Ennyi API-hívás ment el most. */
  calls: number;
  /** Mentésnél a személykeresés ennyi hívásba kerülne (előnézetben becslés). */
  peopleCalls: number;
  rateLimit: { limit: number | null; remaining: number | null };
  rows: ResultRow[];
}

/** Hiba, amit a felület változtatás nélkül megmutathat. */
export class SeedtableError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SeedtableError";
  }
}

export function isSeedtableReady(): boolean {
  return Boolean(credential("SEEDTABLE_API_KEY"));
}

/**
 * A felületről jött szűrők ellenőrzése: csak ismert kulcs, a típusának
 * megfelelő érték. Ami üres, az kimarad; ami hibás, arra emberi mondatú hiba.
 */
export function cleanFilters(
  input: unknown,
): Record<string, string | string[]> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, string | string[]> = {};
  for (const [name, raw] of Object.entries(input as Record<string, unknown>)) {
    const spec = COMPANY_FILTERS[name];
    if (!spec) throw new Error(`Ismeretlen szűrő: ${name}`);
    const values = (Array.isArray(raw) ? raw : [raw])
      .map((value) =>
        value === null || value === undefined ? "" : String(value).trim(),
      )
      .filter(Boolean);
    if (!values.length) continue;
    if (!spec.repeat && values.length > 1) {
      throw new Error(`A(z) ${name} szűrő csak egy értéket kaphat.`);
    }
    for (const value of values) {
      if (spec.kind === "number" && !Number.isFinite(Number(value))) {
        throw new Error(`A(z) ${name} szám legyen (kaptam: ${value}).`);
      }
      if (spec.kind === "boolean" && value !== "true" && value !== "false") {
        throw new Error(`A(z) ${name} csak igen vagy nem lehet.`);
      }
      if (spec.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`A(z) ${name} ÉÉÉÉ-HH-NN alakú dátum legyen.`);
      }
      if (spec.kind === "enum" && !spec.values?.includes(value)) {
        throw new Error(`A(z) ${name} értéke nem ismert: ${value}`);
      }
    }
    out[name] = spec.repeat ? values : values[0];
  }
  return out;
}

/** Egy GET a Seedtable felé; a kvóta- és kulcshibákból magyar mondat lesz. */
async function call<T>(
  path: string,
  params: Record<string, string | string[] | number | boolean>,
  meter: { calls: number; limit: number | null; remaining: number | null },
): Promise<T> {
  const key = credential("SEEDTABLE_API_KEY");
  if (!key) {
    throw new SeedtableError(
      "Nincs SEEDTABLE_API_KEY az atlas-credentials.env fájlban — tedd bele, majd indítsd újra a szervert.",
      400,
    );
  }
  const url = new URL(`${BASE}${path}`);
  for (const [name, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(name, String(item));
    }
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    meter.calls++;
    const limit = Number(response.headers.get("x-ratelimit-limit"));
    const remaining = Number(response.headers.get("x-ratelimit-remaining"));
    if (Number.isFinite(limit) && response.headers.has("x-ratelimit-limit")) {
      meter.limit = limit;
    }
    if (
      Number.isFinite(remaining) &&
      response.headers.has("x-ratelimit-remaining")
    ) {
      meter.remaining = remaining;
    }

    if (response.ok) return (await response.json()) as T;

    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (response.status === 429 && attempt === 0) {
      // Percenkénti keret: egyszer kivárjuk, amit a szerver kér (max. 60 mp).
      const wait = Math.min(
        Number(response.headers.get("retry-after")) || 30,
        60,
      );
      log.warn(`sebességkorlát — várok ${wait} mp-et`);
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      continue;
    }
    const detail = body.error ? ` (${body.error})` : "";
    throw new SeedtableError(
      response.status === 401
        ? `A Seedtable nem fogadta el az API-kulcsot${detail} — nézd meg a SEEDTABLE_API_KEY értékét.`
        : response.status === 403
          ? `A Seedtable elutasította a kérést: elfogyott a havi keret, vagy a csomagod nem tartalmazza ezt${detail}.`
          : response.status === 429
            ? "A Seedtable percenkénti kerete elfogyott — próbáld újra egy perc múlva."
            : `Seedtable-hiba: HTTP ${response.status}${detail}`,
      response.status === 401 || response.status === 403 ? 400 : 502,
    );
  }
  throw new SeedtableError("A Seedtable nem válaszolt.", 502);
}

function websiteOf(company: SeedtableCompany): string | null {
  const raw = company.website?.trim();
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function money(value: number | null): string | null {
  if (!value) return null;
  return value >= 1_000_000
    ? `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
    : `$${Math.round(value / 1000)}k`;
}

function tagOf(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Seedtable-cég → import-sor. A személy a döntéshozó-keresésből jön, ha van. */
function toImportRow(
  company: SeedtableCompany,
  person: { name: string; email: string; linkedin: string | null } | null,
  roleLabel: string | null,
): ImportRow {
  const country = toCountryCode(company.country ?? "") || "INT";
  const size = toSizeBucket(
    company.employeeCount ? String(company.employeeCount) : null,
  );
  const language = country === "HU" ? "hu" : "en";
  const letter = buildCompanyLetter({
    company: company.name,
    city: company.city,
    industry: company.industry,
    size,
    language,
  });
  const note =
    [
      company.industry,
      company.fundingStage ? `stádium: ${company.fundingStage}` : null,
      money(company.totalFunding)
        ? `bevont tőke: ${money(company.totalFunding)}`
        : null,
      money(company.lastFundingAmount)
        ? `utolsó kör: ${money(company.lastFundingAmount)}${company.lastFundingDate ? ` (${company.lastFundingDate})` : ""}`
        : null,
      company.employeeCount ? `${company.employeeCount} fő` : null,
      company.foundedYear ? `alapítva ${company.foundedYear}` : null,
      company.score !== null ? `Seedtable-pont: ${company.score}` : null,
      company.description,
    ]
      .filter(Boolean)
      .join(" · ") || null;

  return {
    kind: "it-company",
    company: company.name,
    website: websiteOf(company),
    person: person?.name ?? null,
    role: person ? roleLabel : null,
    email: person?.email ?? null,
    linkedin: person?.linkedin ?? null,
    country,
    city: company.city,
    size: size ?? "ismeretlen",
    language,
    category: "it-company",
    tags: [
      "seedtable",
      ...(company.industry ? [tagOf(company.industry)] : []),
      ...(company.fundingStage ? [`stadium-${company.fundingStage}`] : []),
      ...(fundingBand(company.totalFunding)
        ? [fundingBand(company.totalFunding) as string]
        : []),
      ...(company.likelyToHire ? ["valoszinuleg-vesz-fel"] : []),
      ...(company.likelyToOutsource ? ["valoszinuleg-kiszervez"] : []),
    ],
    note,
    emailSubject: letter.emailSubject,
    emailBody: letter.emailBody,
    linkedinMessage: letter.linkedinMessage,
    connectionRequest: letter.connectionRequest,
    source: `seedtable-${country.toLowerCase()}`,
  };
}

/** Az első használható cím: ellenőrzött, vagy elég biztos kikövetkeztetett. */
function usableEmail(
  person: SeedtablePerson,
  allowLow: boolean,
): string | null {
  if (person.email) return person.email.toLowerCase();
  const confidence = person.inferredEmailConfidence ?? "";
  // „reported” = valaki jelezte, hogy visszapattant — arra soha nem írunk.
  const ok =
    confidence === "verified" ||
    confidence === "high" ||
    (allowLow && confidence === "low");
  return ok && person.inferredEmail ? person.inferredEmail.toLowerCase() : null;
}

const ROLE_LABELS: Record<string, string> = {
  founder: "Alapító",
  ceo: "CEO",
  cto: "CTO",
  cfo: "CFO",
  coo: "COO",
  cpo: "CPO",
  cmo: "CMO",
  cro: "CRO",
  executive: "Vezető",
  vp_engineering: "VP Engineering",
  vp_sales: "VP Sales",
  vp_marketing: "VP Marketing",
  vp: "VP",
  head_of_product: "Head of Product",
  director: "Igazgató",
  manager: "Menedzser",
};

function parseRows(rows: ImportRow[]): {
  contacts: Contact[];
  errors: Map<number, string>;
} {
  const { contacts, errors } = parseImport(rows, {});
  const failed = new Map<number, string>();
  for (const issue of errors) {
    failed.set(
      issue.index,
      `${failed.get(issue.index) ? `${failed.get(issue.index)}; ` : ""}${issue.field}: ${issue.message}`,
    );
  }
  return { contacts, errors: failed };
}

/**
 * A mentendő sorok: import-ellenőrzésen átvitt kontaktok, mindegyiken a cég
 * teljes Seedtable-adatlapjával (`seedtable` mező).
 */
export function seedtableContacts(
  companies: SeedtableCompany[],
  people: Map<string, { name: string; email: string; linkedin: string | null }>,
  roleLabel: string | null,
  now: string,
): { contacts: Contact[]; errors: Map<number, string> } {
  const result = parseRows(
    companies.map((company) =>
      toImportRow(company, people.get(company.id) ?? null, roleLabel),
    ),
  );
  // A parseImport a hibás sorokat kihagyja — a maradék sorrendben párosul.
  const valid = companies.filter((_, index) => !result.errors.has(index));
  result.contacts.forEach((contact, index) => {
    contact.seedtable = seedtableInfo(valid[index], now);
  });
  return result;
}

/**
 * Egy import-futás. Előnézetben csak a cégeket kéri le és egyezteti; mentéskor
 * az új cégekhez döntéshozót is keres (ha kérted), és elmenti őket.
 */
export async function runSeedtableImport(
  request: SeedtableRequest,
): Promise<SeedtableResult> {
  const max = Math.max(1, Math.min(MAX_COMPANIES, Math.floor(request.max)));
  const meter = {
    calls: 0,
    limit: null as number | null,
    remaining: null as number | null,
  };

  // 1. Cégek, mindig 100-as oldalakkal lapozva — csak így esik egybe az
  // eltolás a Seedtable oldalhatáraival. Az első oldal elejéről annyit dobunk
  // el, amennyivel az eltolás belelóg.
  const offset = Math.max(0, Math.floor(request.offset));
  const companies: SeedtableCompany[] = [];
  let available = 0;
  let skip = offset % PAGE_SIZE;
  let reachedEnd = false;
  for (
    let page = Math.floor(offset / PAGE_SIZE) + 1;
    companies.length < max;
    page++
  ) {
    const result = await call<Page<SeedtableCompany>>(
      "/companies",
      { ...request.filters, page, limit: PAGE_SIZE },
      meter,
    );
    available = result.pagination.total;
    companies.push(...result.data.slice(skip, skip + max - companies.length));
    skip = 0;
    if (!result.data.length || page >= result.pagination.totalPages) {
      reachedEnd = true;
      break;
    }
  }
  const nextOffset =
    !reachedEnd || offset + companies.length < available
      ? offset + companies.length
      : null;
  // Ugyanaz a cég két oldalon is felbukkanhat, ha közben változik a lista.
  const unique = [
    ...new Map(companies.map((item) => [item.id, item])).values(),
  ];

  // 2. Ellenőrzés és egyeztetés személy nélkül — a cég számít, nem az ember.
  const bare = unique.map((company) => toImportRow(company, null, null));
  const parsed = parseRows(bare);
  const byKey = new Map<string, SeedtableCompany>();
  const validCompanies = unique.filter((_, index) => !parsed.errors.has(index));
  parsed.contacts.forEach((contact, index) =>
    byKey.set(contact.key, validCompanies[index]),
  );
  const { fresh, known } = await splitKnown(parsed.contacts);
  const knownById = new Map(
    known.map((match) => [byKey.get(match.contact.key)?.id, match]),
  );
  const freshIds = new Set(fresh.map((contact) => byKey.get(contact.key)?.id));

  // 3. Döntéshozó a mentendő új cégekhez (cégenként egy hívás).
  const people = new Map<
    string,
    { name: string; email: string; linkedin: string | null }
  >();
  const roleLabel =
    request.people.roles.length === 1
      ? (ROLE_LABELS[request.people.roles[0]] ?? null)
      : null;
  if (request.apply && request.people.enabled) {
    for (const company of unique) {
      if (!freshIds.has(company.id)) continue;
      const result = await call<Page<SeedtablePerson>>(
        "/people",
        {
          company_id: company.id,
          limit: 10,
          ...(request.people.roles.length
            ? { role: request.people.roles }
            : {}),
          ...(request.people.decisionMakersOnly
            ? { is_decision_maker: true }
            : {}),
        },
        meter,
      );
      for (const person of result.data) {
        const email = usableEmail(person, request.people.allowLowConfidence);
        const name = [person.firstName, person.lastName]
          .filter(Boolean)
          .join(" ");
        if (email && name) {
          people.set(company.id, { name, email, linkedin: person.linkedin });
          break;
        }
      }
    }
  }

  // 4. Mentés: az új cégek, a megtalált emberrel együtt.
  let saved = 0;
  if (request.apply && fresh.length) {
    const final = seedtableContacts(
      unique.filter((company) => freshIds.has(company.id)),
      people,
      roleLabel,
      new Date().toISOString(),
    );
    saved = (await upsertContacts(final.contacts, { origin: "import" }))
      .inserted;
    await rescore({
      key: { $in: final.contacts.map((contact) => contact.key) },
    } as never);
    log.info(`Seedtable-import: ${saved} új cég mentve`, {
      lekerve: unique.length,
      marBent: known.length,
      emaillel: people.size,
      hivas: meter.calls,
    });
  }

  const errorById = new Map(
    unique.flatMap((company, index) =>
      parsed.errors.has(index) ? [[company.id, parsed.errors.get(index)!]] : [],
    ),
  );
  const rows: ResultRow[] = unique.map((company) => {
    const match = knownById.get(company.id);
    const person = people.get(company.id) ?? null;
    return {
      seedtableId: company.id,
      company: company.name,
      country: toCountryCode(company.country ?? "") || "INT",
      city: company.city,
      website: websiteOf(company),
      industry: company.industry,
      employees: company.employeeCount,
      stage: company.fundingStage,
      score: company.score,
      status: errorById.has(company.id) ? "hibas" : match ? "mar-bent" : "uj",
      detail:
        errorById.get(company.id) ??
        (match ? `${match.reason} alapján: ${match.existing}` : null),
      person: person?.name ?? null,
      email: person?.email ?? null,
    };
  });

  return {
    apply: request.apply,
    available,
    offset,
    nextOffset:
      nextOffset !== null && nextOffset < available ? nextOffset : null,
    fetched: unique.length,
    fresh: fresh.length,
    known: known.length,
    invalid: errorById.size,
    saved,
    withEmail: people.size,
    calls: meter.calls,
    peopleCalls: request.people.enabled ? fresh.length : 0,
    rateLimit: { limit: meter.limit, remaining: meter.remaining },
    rows,
  };
}
