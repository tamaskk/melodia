/**
 * Külső kutatóbot (Grok) két művelete: a következő, még nem keresett cég
 * kiadása, és a kutatás eredményének mentése.
 *
 * A bot nem kap külön szabályokat: ugyanaz a szűrő, ugyanaz az ellenőrzés és
 * ugyanaz a beírási feltétel érvényes rá, mint a beépített begyűjtésre.
 */
import { ObjectId, type Filter } from "mongodb";
import {
  buildQuery,
  getContactById,
  saveEmailSearch,
  serialize,
  savePeople,
  updateContact,
} from "./contacts";
import { normaliseFinding } from "./emailFinder";
import { createLogger } from "./logger";
import { getContacts } from "./mongodb";
import { normalisePeople } from "./peopleFinder";
import type { Contact, ContactDoc, ContactFilters } from "./types";

const log = createLogger("bot");

/** Ennyi percig foglalja a bot a céget, ha nem ad meg mást. */
export const DEFAULT_LEASE_MINUTES = 30;
export const MAX_LEASE_MINUTES = 240;

/** Sorrendek a kiadáshoz — a lista rendezéseivel egyezik, mindhez van index. */
const CLAIM_SORTS: Record<string, Record<string, 1 | -1>> = {
  score: { score: -1, company: 1 },
  company: { company: 1 },
  newest: { createdAt: -1 },
  default: { source: 1, company: 1 },
};

/**
 * A következő cég, amihez még sosem kerestünk e-mailt — **lefoglalva**.
 *
 * Több bot fut egyszerre, ezért a kiválasztás és a foglalás egy atomi lépés
 * (`findOneAndUpdate`): két egyszerre érkező kérés sosem kapja ugyanazt a
 * céget. A foglalás `leaseMinutes` után lejár, így az elhalt bot cége újra
 * kiadható. A hívó szűrői szűkíthetnek, de a „nincs cím, és nem is kerestük"
 * feltételt nem tudják kikapcsolni.
 */
export async function claimNext(
  filters: ContactFilters,
  options: { skip?: number; leaseMinutes?: number; bot?: string | null } = {},
): Promise<{
  contact: ContactDoc | null;
  remaining: number;
  inProgress: number;
  claimUntil: string | null;
}> {
  const forced: ContactFilters = {
    ...filters,
    hasEmail: "",
    emailSearched: "",
    emailStatus: "unsearched",
  };
  const now = new Date();
  const nowIso = now.toISOString();
  const lease = Math.min(
    MAX_LEASE_MINUTES,
    Math.max(1, options.leaseMinutes ?? DEFAULT_LEASE_MINUTES),
  );
  const until = new Date(now.getTime() + lease * 60_000).toISOString();

  // Szabad: soha nem foglalták, vagy a foglalás lejárt.
  const free: Filter<Contact> = {
    $or: [
      { botStatus: { $ne: "in-progress" } },
      { botClaimUntil: { $lt: nowIso } },
    ],
  } as Filter<Contact>;
  const query = { $and: [buildQuery(forced), free] } as Filter<Contact>;
  const sort = CLAIM_SORTS[filters.sort ?? "score"] ?? CLAIM_SORTS.score;

  const collection = await getContacts();
  let claimed = null;
  // `skip`: a régi kliensek kedvéért. Foglalásnál ritkán kell, mert a
  // lefoglalt cég úgyis kimarad a következő kérésből.
  const skip = Math.max(0, options.skip ?? 0);
  if (skip > 0) {
    const target = await collection
      .find(query, { projection: { _id: 1 } })
      .sort(sort)
      .skip(skip)
      .limit(1)
      .next();
    if (target) {
      claimed = await collection.findOneAndUpdate(
        { $and: [{ _id: target._id }, free] } as Filter<Contact>,
        claimSet(nowIso, until, options.bot),
        { returnDocument: "after" },
      );
    }
  } else {
    claimed = await collection.findOneAndUpdate(
      query,
      claimSet(nowIso, until, options.bot),
      { sort, returnDocument: "after" },
    );
  }

  const [remaining, inProgress] = await Promise.all([
    collection.countDocuments(query),
    collection.countDocuments({
      $and: [
        buildQuery(forced),
        { botStatus: "in-progress", botClaimUntil: { $gte: nowIso } },
      ],
    } as Filter<Contact>),
  ]);
  if (claimed) {
    log.info(`kiadva: ${claimed.company}`, {
      bot: options.bot ?? null,
      lejar: until,
      maradt: remaining,
    });
  }
  return {
    contact: claimed ? serialize(claimed) : null,
    remaining,
    inProgress,
    claimUntil: claimed ? until : null,
  };
}

function claimSet(at: string, until: string, bot?: string | null) {
  return {
    $set: {
      botStatus: "in-progress" as const,
      botClaimedAt: at,
      botClaimUntil: until,
      botClaimedBy: bot ?? null,
    },
  };
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
  /** Mentés után mindig `done` — a foglalás felszabadult. */
  botStatus: "done";
  botResult: "found" | "none";
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

  // Minden érvényes cím bekerül, de csak üres sorba — a cél, hogy menjen ki
  // levél. A bizonytalant (low vagy forrás nélküli) megcímkézzük, hogy kiküldés
  // előtt szűrhető legyen.
  const fill = Boolean(finding.email) && !contact.primaryEmail;
  const unverified = finding.confidence === "low" || source === null;

  let emailRejected: string | null = null;
  if (!fill && typeof body.email === "string" && body.email.trim()) {
    emailRejected = !finding.email
      ? "formailag hibás cím"
      : "a sornak már van címe — javaslatként tároltuk";
  }

  const patch: Record<string, unknown> = {};
  if (fill) {
    patch.primaryEmail = finding.email;
    patch.tags = [
      ...new Set([
        ...contact.tags.filter((tag) => tag !== "nincs-email"),
        "van-email",
        "kutatott-email",
        ...(unverified ? ["ellenorizetlen-email"] : []),
      ]),
    ];
    patch.note = [contact.note, `e-mail forrása: ${source ?? "nincs megadva"}`]
      .filter(Boolean)
      .join(" · ");
  }
  // Hiányzó céges linkeket pótolhat, meglévőt nem ír felül.
  const website = asUrl(body.website);
  if (!contact.website && website) patch.website = website;
  const linkedinUrl = asUrl(body.linkedinUrl);
  if (!contact.linkedinUrl && linkedinUrl) patch.linkedinUrl = linkedinUrl;

  if (Object.keys(patch).length) await updateContact(id, patch, "grokbot");

  // A foglalás felszabadul — akkor is, ha semmit nem talált (email: null).
  const botResult = finding.email ? "found" : "none";
  await (
    await getContacts()
  ).updateOne({ _id: new ObjectId(id) } as Filter<Contact>, {
    $set: { botStatus: "done", botResult, botClaimUntil: null },
  });

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
    botStatus: "done",
    botResult,
  };
}
