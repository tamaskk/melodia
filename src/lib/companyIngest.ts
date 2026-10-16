/**
 * Cégek felvétele külső programból (másik AI, szkript) — egyesével vagy
 * kötegben, a `/api/bot/companies` végponton át.
 *
 * Laza, könnyen előállítható alakot fogad (cégnév, weboldal, ország, méret…),
 * és ebből építi a teljes import-sort: a megkereső levelet a cég adataiból
 * generálja, a méretet sávra kerekíti. Ami már bent van (kulcs, domain vagy
 * cégnév + ország alapján), azt nem írja felül — csak jelzi.
 */
import { rescore, upsertContacts } from "./contacts";
import { buildCompanyLetter, toSizeBucket } from "./csvImport";
import { toCountryCode } from "./countries";
import { splitKnown } from "./importDedupe";
import { parseImport, type ImportRow, type RowIssue } from "./importSchema";
import { createLogger } from "./logger";
import { contactDomain } from "./recipients";

const log = createLogger("ceg-api");

/** Egy kérésben legfeljebb ennyi cég — az Atlas M0 és a Vercel időkorlát miatt. */
export const MAX_COMPANIES = 200;

export interface IngestResult {
  dryRun: boolean;
  received: number;
  inserted: number;
  /** Az újonnan felvett (vagy dryRun-nál felvehető) cégek. */
  created: { index: number; company: string; key: string }[];
  /** Már bent volt, vagy a kötegen belül ismétlődött — nem írtuk. */
  skipped: { index: number; company: string; reason: string }[];
  errors: RowIssue[];
  warnings: RowIssue[];
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const list = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && !!item.trim(),
      )
    : [];

/**
 * A forrás neve: `gridleads_<üzlettípus>_<országkód>`, pl. `gridleads_it_hu`,
 * `gridleads_software-it-consultant_de`. Kisbetű, a szóköz kötőjel lesz; ha a
 * végéről hiányzik az országkód, a sor országát fűzzük hozzá.
 */
function sourceSlug(value: string | null, country: string): string {
  const cc = country.toLowerCase() || "int";
  const base = (value ?? "api")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "-")
    .replace(/-*_-*/g, "_")
    .replace(/^[-_]+|[-_]+$/g, "");
  if (!base) return `api_${cc}`;
  return /_([a-z]{2}|int)$/.test(base) ? base : `${base}_${cc}`;
}

/** A laza bemenetből teljes import-sor; a levelet a cég adataiból írjuk. */
function toImportRow(raw: Record<string, unknown>): ImportRow {
  const company = str(raw.company) ?? str(raw.name) ?? "";
  const countryRaw = str(raw.country) ?? "";
  const country = toCountryCode(countryRaw) || countryRaw;
  const size =
    toSizeBucket(
      str(raw.size) ??
        str(raw.employees) ??
        (raw.employees != null ? String(raw.employees) : null),
    ) ?? "ismeretlen";
  const language = str(raw.language) ?? (country === "HU" ? "hu" : "en");
  const industry = str(raw.industry);
  const letter = buildCompanyLetter({
    company,
    city: str(raw.city),
    industry,
    size,
    language: language === "hu" ? "hu" : "en",
  });
  const website = str(raw.website);
  const note =
    [
      str(raw.description) ?? str(raw.note),
      industry ? `iparág: ${industry}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;

  return {
    kind: "it-company",
    company,
    // Csupasz domaint is elfogadunk: "ceg.hu" → "https://ceg.hu".
    website:
      website && !/^https?:\/\//i.test(website)
        ? `https://${website}`
        : website,
    email: str(raw.email),
    otherEmails: list(raw.otherEmails),
    linkedin: str(raw.linkedin) ?? str(raw.linkedinUrl),
    country,
    city: str(raw.city),
    size,
    language,
    category: "it-company",
    tags: ["api-import", ...list(raw.tags)],
    note,
    emailSubject: letter.emailSubject,
    emailBody: letter.emailBody,
    linkedinMessage: letter.linkedinMessage,
    connectionRequest: letter.connectionRequest,
    source: sourceSlug(str(raw.source), toCountryCode(countryRaw)),
  };
}

/** A bemenet: egy objektum, egy tömb, vagy `{ companies: [...] }`. */
export function readCompanies(body: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === "object") {
    const wrapped = (body as { companies?: unknown }).companies;
    if (Array.isArray(wrapped)) return wrapped as Record<string, unknown>[];
    if ((body as { company?: unknown }).company !== undefined) {
      return [body as Record<string, unknown>];
    }
  }
  return null;
}

export async function ingestCompanies(
  rows: Record<string, unknown>[],
  dryRun: boolean,
): Promise<IngestResult> {
  const result: IngestResult = {
    dryRun,
    received: rows.length,
    inserted: 0,
    created: [],
    skipped: [],
    errors: [],
    warnings: [],
  };

  // Soronként ellenőrzünk, hogy a hibás sor indexe a bemenetre mutasson.
  const parsed = rows.map((raw, index) => {
    if (!str(raw?.source)) {
      result.errors.push({
        index,
        company: str(raw?.company) ?? `#${index + 1}`,
        field: "source",
        message:
          "Kötelező: gridleads_<üzlettípus>_<országkód>, pl. gridleads_it_hu.",
      });
      return { index, contact: null };
    }
    const outcome = parseImport([toImportRow(raw ?? {})]);
    for (const issue of outcome.errors) result.errors.push({ ...issue, index });
    for (const issue of outcome.warnings) {
      // Az "importalt"/méret figyelmeztetések zajt csinálnának — csak a lényeg megy vissza.
      if (issue.field !== "kind") result.warnings.push({ ...issue, index });
    }
    return { index, contact: outcome.contacts[0] ?? null };
  });

  // Kötegen belüli ismétlődés: ugyanaz a kulcs vagy domain kétszer.
  const seen = new Set<string>();
  const candidates = parsed.flatMap(({ index, contact }) => {
    if (!contact) return [];
    const marks = [contact.key, contactDomain(contact)].filter(
      Boolean,
    ) as string[];
    if (marks.some((mark) => seen.has(mark))) {
      result.skipped.push({
        index,
        company: contact.company,
        reason: "ismétlődik ebben a kérésben",
      });
      return [];
    }
    marks.forEach((mark) => seen.add(mark));
    return [{ index, contact }];
  });

  const { fresh, known } = await splitKnown(
    candidates.map((item) => item.contact),
  );
  const indexOf = new Map(
    candidates.map((item) => [item.contact.key, item.index]),
  );
  for (const match of known) {
    result.skipped.push({
      index: indexOf.get(match.contact.key) ?? -1,
      company: match.contact.company,
      reason: `már bent van (${match.reason}: ${match.existing})`,
    });
  }
  result.created = fresh.map((contact) => ({
    index: indexOf.get(contact.key) ?? -1,
    company: contact.company,
    key: contact.key,
  }));

  if (!dryRun && fresh.length) {
    const saved = await upsertContacts(fresh, { origin: "import" });
    result.inserted = saved.inserted;
    await rescore({
      key: { $in: fresh.map((contact) => contact.key) },
    } as never);
  }
  result.skipped.sort((a, b) => a.index - b.index);
  log.info(
    `${dryRun ? "próba" : "felvétel"}: ${rows.length} cég → ${dryRun ? fresh.length : result.inserted} új, ${result.skipped.length} kihagyva, ${result.errors.length} hiba`,
  );
  return result;
}
