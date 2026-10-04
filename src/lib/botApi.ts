/**
 * Külső kutatóbot (Grok) két művelete: a következő, még nem keresett cég
 * kiadása, és a kutatás eredményének mentése.
 *
 * A bot nem kap külön szabályokat: ugyanaz a szűrő, ugyanaz az ellenőrzés és
 * ugyanaz a beírási feltétel érvényes rá, mint a beépített begyűjtésre.
 */
import {
  countContacts,
  getContactById,
  listContacts,
  saveEmailSearch,
  savePeople,
  updateContact,
} from "./contacts";
import { normaliseFinding } from "./emailFinder";
import { createLogger } from "./logger";
import { normalisePeople } from "./peopleFinder";
import type { ContactDoc, ContactFilters } from "./types";

const log = createLogger("bot");

/**
 * Egy cég, amihez még sosem kerestünk e-mailt. A hívó szűrői szűkíthetnek, de
 * a „nincs cím, és nem is kerestük" feltételt nem tudják kikapcsolni.
 */
export async function nextUnsearched(
  filters: ContactFilters,
  skip = 0,
): Promise<{ contact: ContactDoc | null; remaining: number }> {
  const forced: ContactFilters = {
    ...filters,
    hasEmail: "",
    emailSearched: "",
    emailStatus: "unsearched",
    sort: filters.sort || "score",
  };
  const [contacts, remaining] = await Promise.all([
    listContacts(forced, { page: skip, pageSize: 1 }),
    countContacts(forced),
  ]);
  return { contact: contacts[0] ?? null, remaining };
}

export interface BotSaveResult {
  id: string;
  company: string;
  searchedAt: string;
  /** Az ellenőrzésen átment cím — akkor is, ha csak javaslatként tároltuk. */
  email: string | null;
  /** Bekerült-e a sor fő címének. */
  emailSaved: boolean;
  /** Ha jött cím, de nem írtuk be: miért. */
  emailRejected: string | null;
  /** A sorra beírt mezők. */
  fields: string[];
  /** A sor kapcsolattartóinak száma mentés után; `null`, ha a kérés nem hozott embert. */
  people: number | null;
}

function asUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null;
}

/**
 * A bot kutatásának mentése. A keresés nyoma mindig rákerül a sorra — így a
 * cég nem jön vissza a következő kérésnél akkor sem, ha semmit nem találtunk.
 */
export async function saveBotResult(
  id: string,
  body: Record<string, unknown>,
): Promise<BotSaveResult | null> {
  const contact = await getContactById(id);
  if (!contact) return null;

  const model =
    typeof body.model === "string" && body.model.trim()
      ? body.model.trim().slice(0, 80)
      : "grokbot";
  const citations = Array.isArray(body.citations)
    ? [
        ...new Set(
          body.citations
            .map(asUrl)
            .filter((url): url is string => url !== null),
        ),
      ].slice(0, 20)
    : [];
  const finding = normaliseFinding(body, model, citations);
  const source = asUrl(finding.source);
  const at = new Date().toISOString();

  await saveEmailSearch(id, {
    at,
    result: finding.email ? "found" : "none",
    email: finding.email,
    confidence: finding.confidence,
    source: finding.source,
    applyUrl: finding.applyUrl,
    alternatives: finding.alternatives,
    notes: finding.notes,
    citations,
    model,
  });

  // Csak forrással alátámasztott címet írunk be, és csak üres sorba.
  const fill =
    Boolean(finding.email) &&
    !contact.primaryEmail &&
    finding.confidence !== "low" &&
    source !== null;

  let emailRejected: string | null = null;
  if (!fill && typeof body.email === "string" && body.email.trim()) {
    if (!finding.email) emailRejected = "formailag hibás cím";
    else if (contact.primaryEmail) emailRejected = "a sornak már van címe";
    else if (finding.confidence === "low")
      emailRejected = "low megbízhatóság — csak javaslatként tároltuk";
    else emailRejected = "hiányzik a forrás URL — csak javaslatként tároltuk";
  }

  const patch: Record<string, unknown> = {};
  if (fill) {
    patch.primaryEmail = finding.email;
    patch.tags = [
      ...new Set([
        ...contact.tags.filter((tag) => tag !== "nincs-email"),
        "van-email",
        "kutatott-email",
      ]),
    ];
    patch.note = [contact.note, `e-mail forrása: ${source}`]
      .filter(Boolean)
      .join(" · ");
  }
  // Hiányzó céges linkeket pótolhat, meglévőt nem ír felül.
  const website = asUrl(body.website);
  if (!contact.website && website) patch.website = website;
  const linkedinUrl = asUrl(body.linkedinUrl);
  if (!contact.linkedinUrl && linkedinUrl) patch.linkedinUrl = linkedinUrl;

  if (Object.keys(patch).length) await updateContact(id, patch, "grokbot");

  let people: number | null = null;
  if (Array.isArray(body.people)) {
    const found = normalisePeople({ people: body.people }, model).people;
    const saved = await savePeople(
      id,
      found,
      typeof body.peopleNotes === "string" && body.peopleNotes.trim()
        ? body.peopleNotes
        : `Grokbot: ${found.length} fő.`,
    );
    people = saved.length;
  }

  log.info(
    `mentve: ${contact.company} → ${finding.email ?? "nincs cím"}` +
      `${fill ? " (beírva)" : finding.email ? " (csak javaslat)" : ""}`,
    { confidence: finding.confidence, emberek: people, model },
  );

  return {
    id,
    company: contact.company,
    searchedAt: at,
    email: finding.email,
    emailSaved: fill,
    emailRejected,
    fields: Object.keys(patch),
    people,
  };
}
