import { Filter, ObjectId, WithId } from "mongodb";
import { companyAliases } from "./companyMatch";
import { recordChange } from "./history";
import { createLogger } from "./logger";
import { getContacts } from "./mongodb";
import { COMPANY_SIZES } from "./types";
import { isOutcome, isStage, stageQuery } from "./stage";
import { SCORE_EXPRESSION } from "./score";
import { DOMAIN_EXPRESSION } from "./recipients";
import { followUpDueQuery } from "./followup";
import type {
  CompanyPerson,
  Contact,
  ContactDoc,
  ContactFilters,
  EmailSearchRecord,
  Stats,
} from "./types";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildQuery(filters: ContactFilters): Filter<Contact> {
  const and: Filter<Contact>[] = [];

  if (filters.q?.trim()) {
    const rx = new RegExp(escapeRegex(filters.q.trim()), "i");
    and.push({
      $or: [
        { company: rx },
        { person: rx },
        { role: rx },
        { note: rx },
        { city: rx },
        { emails: rx },
        { tags: rx },
      ],
    });
  }

  const eq = <K extends keyof Contact>(field: K, value?: string) => {
    if (value && value !== "all")
      and.push({ [field]: value } as Filter<Contact>);
  };

  eq("source", filters.source);
  eq("kind", filters.kind);
  eq("channel", filters.channel);
  eq("country", filters.country);
  eq("language", filters.language);
  eq("category", filters.category);
  eq("city", filters.city);
  eq("size", filters.size);

  if (filters.tag && filters.tag !== "all") and.push({ tags: filters.tag });

  if (filters.hasEmail === "yes") and.push({ primaryEmail: { $ne: null } });
  if (filters.hasEmail === "no") and.push({ primaryEmail: null });

  // "már kerestünk hozzá e-mailt a weben"
  if (filters.emailSearched === "yes")
    and.push({ emailSearchedAt: { $ne: null } });
  if (filters.emailSearched === "no") {
    and.push({
      $or: [{ emailSearchedAt: null }, { emailSearchedAt: { $exists: false } }],
    });
  }

  // "van megtalált kapcsolattartó" / "kerestünk már embert hozzá"
  if (filters.hasPeople === "yes") and.push({ "people.0": { $exists: true } });
  if (filters.hasPeople === "no") {
    and.push({
      $or: [{ people: { $size: 0 } }, { people: { $exists: false } }],
    });
  }
  if (filters.peopleSearched === "yes")
    and.push({ peopleSearchedAt: { $ne: null } });
  if (filters.peopleSearched === "no") {
    and.push({
      $or: [
        { peopleSearchedAt: null },
        { peopleSearchedAt: { $exists: false } },
      ],
    });
  }

  // Három alapállapot: még nem kerestük (null) · van · nincs. A "nincs" két
  // felé bomlik: ajánlott-e mégis valamit a keresés (másik címet), vagy semmit.
  // `{ mező: null }` a hiányzó mezőre is illeszkedik.
  const noEmail = { primaryEmail: null };
  const emailSearchedYes = { emailSearchedAt: { $ne: null } };
  // Javaslat: amivel mégis el lehet indulni. Két fajta, átfedés nélkül:
  // - cím: másik cím, be nem írt találat, vagy a jegyzetben említett cím;
  // - űrlap: jelentkezési űrlap, és címjavaslat nincs (ha mindkettő van, a cím nyer).
  const emailHints = [
    { "emailSearch.alternatives.0": { $exists: true } },
    { "emailSearch.email": { $nin: [null, ""] } },
    {
      emailSearchNote: {
        $regex: "[a-z0-9._%+-]+@[a-z0-9-]+(\\.[a-z0-9-]+)+",
        $options: "i",
      },
    },
  ];
  const formHint = { "emailSearch.applyUrl": { $nin: [null, ""] } };
  const suggestion = { $or: [...emailHints, formHint] };
  switch (filters.emailStatus) {
    case "found":
      and.push({ primaryEmail: { $ne: null } });
      break;
    case "missing":
      and.push(noEmail);
      break;
    case "unsearched":
      and.push(noEmail, { emailSearchedAt: null });
      break;
    case "none":
      and.push(noEmail, emailSearchedYes);
      break;
    case "suggested":
      and.push(noEmail, emailSearchedYes, suggestion as Filter<Contact>);
      break;
    case "suggested-email":
      and.push(noEmail, emailSearchedYes, {
        $or: emailHints,
      } as Filter<Contact>);
      break;
    case "suggested-form":
      and.push(
        noEmail,
        emailSearchedYes,
        formHint as Filter<Contact>,
        {
          $nor: emailHints,
        } as Filter<Contact>,
      );
      break;
    case "nothing":
      and.push(noEmail, emailSearchedYes, {
        $nor: suggestion.$or,
      } as Filter<Contact>);
      break;
  }

  // Kapcsolattartó: a sor saját neve (`person`) vagy a keresésből jött ember.
  const noContact = {
    person: { $in: [null, ""] },
    "people.0": { $exists: false },
  } as Filter<Contact>;
  switch (filters.contactStatus) {
    case "found":
      and.push({
        $or: [
          { person: { $nin: [null, ""] } },
          { "people.0": { $exists: true } },
        ],
      } as Filter<Contact>);
      break;
    case "missing":
      and.push(noContact);
      break;
    case "unsearched":
      and.push(noContact, { peopleSearchedAt: null });
      break;
    case "none":
      and.push(noContact, { peopleSearchedAt: { $ne: null } });
      break;
  }

  // Hol tart a megkeresés — a levezetés szabálya a stage.ts-ben van, egy helyen.
  if (filters.stage && isStage(filters.stage)) {
    and.push(stageQuery(filters.stage) as Filter<Contact>);
  }
  if (filters.outcome === "none")
    and.push({ outcome: null } as Filter<Contact>);
  // Új válasz: jött, és azóta nem kezelted (nem válaszoltál, nem zártad le).
  if (filters.reply === "new") {
    and.push({
      repliedAt: { $ne: null },
      $or: [
        { replyHandledAt: null },
        { $expr: { $lt: ["$replyHandledAt", "$repliedAt"] } },
      ],
    } as Filter<Contact>);
  }
  if (filters.followUp === "due" || filters.followUp === "approved") {
    and.push(followUpDueQuery() as Filter<Contact>);
    if (filters.followUp === "approved") {
      and.push({ followUpApprovedAt: { $ne: null } } as Filter<Contact>);
    }
  }

  const bool = (field: "sent" | "done" | "starred", value?: string) => {
    if (value === "yes") and.push({ [field]: true } as Filter<Contact>);
    if (value === "no") and.push({ [field]: false } as Filter<Contact>);
  };
  bool("sent", filters.sent);
  bool("done", filters.done);
  bool("starred", filters.starred);

  return and.length ? { $and: and } : {};
}

const SORTS: Record<string, Record<string, 1 | -1>> = {
  // Illeszkedés szerint (score.ts) — ez az alapértelmezett a listában.
  score: { score: -1, company: 1 },
  default: { source: 1, company: 1 },
  company: { company: 1 },
  "company-desc": { company: -1 },
  person: { person: 1 },
  status: { done: 1, sent: 1, company: 1 },
  updated: { updatedAt: -1 },
  newest: { createdAt: -1, company: 1 },
  searched: { emailSearchedAt: -1, company: 1 },
  "sent-oldest": { sentAt: 1 },
  oldest: { createdAt: 1, company: 1 },
  email: { primaryEmail: -1, company: 1 },
};

const log = createLogger("db");

/**
 * Illeszkedési pontszám újraszámolása — az adatbázisban, pipeline-os
 * `updateMany`-vel: egy sor sem jön át a hálózaton, 133 ezer sornál is.
 */
export async function rescore(filter: Filter<Contact> = {}): Promise<number> {
  const collection = await getContacts();
  const result = await collection.updateMany(filter, [
    // A pontszám mellett a cég domainje is itt frissül (import-egyeztetéshez).
    { $set: { score: SCORE_EXPRESSION, domain: DOMAIN_EXPRESSION } },
  ]);
  return result.modifiedCount;
}

/**
 * Teljes újraszámolás forrásonként, kisebb adagokban. Az Atlas M0 egyetlen
 * 133 ezer soros módosítást előre elutasít („over your space quota”), akkor is,
 * ha a tényleges növekmény csak pár MB — forrásonként átmegy.
 */
export async function rescoreAll(): Promise<{ updated: number; ms: number }> {
  const started = Date.now();
  const collection = await getContacts();
  const sources = (await collection.distinct("source")) as string[];
  let updated = 0;
  for (const source of sources) {
    updated += await rescore({ source } as Filter<Contact>);
  }
  // Forrás nélküli sorok (ha lennének).
  updated += await rescore({ source: { $in: [null, ""] } } as Filter<Contact>);
  return { updated, ms: Date.now() - started };
}

/** Egy-egy sor pontszáma a mentés után. A hibája nem buktatja a mentést. */
export function rescoreIds(ids: string[]): void {
  const valid = ids
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  if (!valid.length) return;
  void rescore({ _id: { $in: valid } } as Filter<Contact>).catch(
    (error: Error) =>
      log.warn(`pontszám frissítése nem sikerült: ${error.message}`),
  );
}

export interface ListOptions {
  /** 0-alapú oldalszám. */
  page?: number;
  /** Ennyi sort adunk vissza. A böngészőnek sosem küldünk többet, mint ami látszik. */
  pageSize?: number;
}

/**
 * Egy oldalnyi kontakt. A lapozás szerveroldali: az Atlas ingyenes csomagján a
 * hálózat a szűk keresztmetszet (~100 KB/s), és egy teljes sor a levélszöveggel
 * együtt 2-3 KB — 2000 sor letöltése percekig tartana.
 */
export async function listContacts(
  filters: ContactFilters,
  options: ListOptions = {},
): Promise<ContactDoc[]> {
  const collection = await getContacts();
  const sort = SORTS[filters.sort ?? "default"] ?? SORTS.default;
  const started = Date.now();
  const pageSize = Math.max(1, Math.min(2000, options.pageSize ?? 50));
  const page = Math.max(0, options.page ?? 0);

  const docs = await collection
    .find(buildQuery(filters))
    .sort(sort)
    .skip(page * pageSize)
    .limit(pageSize)
    .toArray();

  const active = Object.entries(filters).filter(
    ([, value]) => value && value !== "all" && value !== "default",
  );
  log.debug(
    `lista: ${docs.length} sor${active.length ? ` (${active.length} szűrő)` : ""}`,
    {
      szurok: Object.fromEntries(active),
      oldal: page,
      oldalMeret: pageSize,
      ms: Date.now() - started,
    },
  );

  return docs.map(serialize);
}

/** Hány sor felel meg a szűrőnek — a 2000-es listakorlát nélkül. */
export async function countContacts(filters: ContactFilters): Promise<number> {
  const collection = await getContacts();
  return collection.countDocuments(buildQuery(filters));
}

/**
 * Csak az azonosítók, a lista 2000-es korlátja nélkül. A begyűjtés ezt
 * használja: 130 000 teljes dokumentum memóriába olvasása felesleges.
 */
export async function listContactIds(
  filters: ContactFilters,
  max = 0,
): Promise<string[]> {
  const collection = await getContacts();
  const sort = SORTS[filters.sort ?? "default"] ?? SORTS.default;
  const cursor = collection
    .find(buildQuery(filters), { projection: { _id: 1 } })
    .sort(sort);
  if (max > 0) cursor.limit(max);
  const docs = await cursor.toArray();
  log.debug(`id-lista: ${docs.length} sor`, { max });
  return docs.map((doc) => doc._id.toString());
}

export interface RecentSearch {
  _id: string;
  company: string;
  country: string;
  website: string | null;
  primaryEmail: string | null;
  emailSearchedAt: string;
  /** Amit a keresés talált — nem biztos, hogy be is lett írva. */
  email: string | null;
  confidence: string | null;
  source: string | null;
  applyUrl: string | null;
  alternatives: number;
  notes: string | null;
  model: string | null;
  people: number;
  peopleSearchedAt: string | null;
}

/**
 * A legutóbb keresett cégek, a legfrissebb elöl — csak az a pár mező, ami a
 * listához kell, a darabszámokat a szerver számolja.
 */
export async function listRecentSearches(
  options: ListOptions & { withEmail?: boolean } = {},
): Promise<{ rows: RecentSearch[]; total: number }> {
  const collection = await getContacts();
  const pageSize = Math.max(1, Math.min(200, options.pageSize ?? 50));
  const page = Math.max(0, options.page ?? 0);
  const query = {
    emailSearchedAt: { $ne: null },
    ...(options.withEmail ? { primaryEmail: { $ne: null } } : {}),
  } as Filter<Contact>;

  const [docs, total] = await Promise.all([
    collection
      .aggregate<Omit<RecentSearch, "_id"> & { _id: ObjectId }>([
        { $match: query },
        { $sort: { emailSearchedAt: -1 } },
        { $skip: page * pageSize },
        { $limit: pageSize },
        {
          $project: {
            company: 1,
            country: 1,
            website: 1,
            primaryEmail: 1,
            emailSearchedAt: 1,
            email: { $ifNull: ["$emailSearch.email", null] },
            confidence: { $ifNull: ["$emailSearch.confidence", null] },
            source: { $ifNull: ["$emailSearch.source", null] },
            applyUrl: { $ifNull: ["$emailSearch.applyUrl", null] },
            alternatives: {
              $size: { $ifNull: ["$emailSearch.alternatives", []] },
            },
            notes: { $ifNull: ["$emailSearchNote", null] },
            model: { $ifNull: ["$emailSearch.model", null] },
            people: { $size: { $ifNull: ["$people", []] } },
            peopleSearchedAt: { $ifNull: ["$peopleSearchedAt", null] },
          },
        },
      ])
      .toArray(),
    collection.countDocuments(query),
  ]);

  return {
    rows: docs.map((doc) => ({ ...doc, _id: doc._id.toString() })),
    total,
  };
}

export async function getContactById(id: string): Promise<ContactDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  const collection = await getContacts();
  const doc = await collection.findOne({ _id: new ObjectId(id) });
  return doc ? serialize(doc) : null;
}

export function serialize(doc: WithId<Contact>): ContactDoc {
  const { _id, ...rest } = doc;
  return { ...rest, _id: _id.toString() };
}

const MUTABLE_FLAGS = ["sent", "done", "starred"] as const;
const MUTABLE_FIELDS = [
  "source",
  "kind",
  "company",
  "website",
  "person",
  "role",
  "primaryEmail",
  "emails",
  "linkedinUrl",
  "city",
  "country",
  "size",
  "language",
  "category",
  "tags",
  "note",
  "emailSubject",
  "emailBody",
  "linkedinMessage",
  "connectionRequest",
  "channel",
] as const;

export async function updateContact(
  id: string,
  patch: Record<string, unknown>,
  /** Honnan jött a módosítás — a változásnaplóban ez látszik. */
  source = "kézi szerkesztés",
): Promise<ContactDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  const collection = await getContacts();
  const now = new Date().toISOString();
  const set: Record<string, unknown> = { updatedAt: now };

  for (const flag of MUTABLE_FLAGS) {
    if (typeof patch[flag] === "boolean") {
      set[flag] = patch[flag];
      if (flag !== "starred") set[`${flag}At`] = patch[flag] ? now : null;
    }
  }

  for (const field of MUTABLE_FIELDS) {
    if (field in patch) set[field] = patch[field];
  }

  // Kézi kimenetel: csak ismert érték menthető, minden más törli.
  if ("outcome" in patch) {
    set.outcome = isOutcome(patch.outcome) ? patch.outcome : null;
    set.outcomeAt = set.outcome ? now : null;
  }

  if ("primaryEmail" in set) {
    const email = set.primaryEmail as string | null;
    const existing = (set.emails as string[] | undefined) ?? [];
    if (email && !existing.includes(email)) set.emails = [email, ...existing];
    if (!email && !("emails" in patch)) set.emails = [];
  }

  // A cégnév-aliasok a keresés indexe: ha a név változik, ezeknek is követniük
  // kell, különben az „megvan-e már?" ellenőrzés a régi néven keresne.
  if (typeof set.company === "string") {
    set.aliases = companyAliases(set.company);
  }

  // Remember which content fields were hand-edited so a later re-import of the
  // PDFs leaves them alone.
  const touched = MUTABLE_FIELDS.filter((field) => field in set);

  log.debug(
    `mentés: ${Object.keys(set)
      .filter((f) => f !== "updatedAt")
      .join(", ")}`,
    {
      id,
    },
  );

  // A módosítás előtti állapot kell a naplóhoz — enélkül nincs mit visszaállítani.
  const previous = await collection.findOne({ _id: new ObjectId(id) });

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) },
    touched.length
      ? { $set: set, $addToSet: { manualFields: { $each: touched } } }
      : { $set: set },
    { returnDocument: "after" },
  );

  rescoreIds([id]);

  if (result && previous) {
    // A napló sosem buktathatja meg a mentést.
    void recordChange(
      id,
      previous.company,
      previous as unknown as Record<string, unknown>,
      set,
      source,
    ).catch(() => undefined);
  }

  return result ? serialize(result) : null;
}

/**
 * Elmenti a webes e-mail keresés TELJES eredményét: a talált címet, a forrást,
 * a jelentkezési űrlapot, az összes további címet és a megnyitott oldalakat.
 * A lapos mezők (emailSearchedAt / -Result / -Note) a szűréshez maradnak.
 */
/** Naplózott törlés — visszafordíthatatlan, ezért mindig nyoma marad. */
export async function saveEmailSearch(
  id: string,
  record: EmailSearchRecord,
): Promise<void> {
  if (!ObjectId.isValid(id)) return;
  const collection = await getContacts();
  await collection.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        emailSearchedAt: record.at,
        emailSearchResult: record.result,
        emailSearchNote: record.notes.slice(0, 800) || null,
        emailSearch: record,
      },
    },
  );
  rescoreIds([id]);
}

/**
 * Megtalált kapcsolattartók mentése a sorra.
 *
 * A meglévő embereket nem dobjuk el: névre egyesítünk, és a frissebb adat
 * nyer. Így egy második keresés bővíti a listát, nem felülírja.
 */
export async function savePeople(
  id: string,
  people: CompanyPerson[],
  notes: string,
): Promise<CompanyPerson[]> {
  if (!ObjectId.isValid(id)) return [];
  const collection = await getContacts();
  const existing = await collection.findOne(
    { _id: new ObjectId(id) },
    { projection: { people: 1 } },
  );

  const merged = new Map<string, CompanyPerson>();
  for (const person of existing?.people ?? [])
    merged.set(person.name.toLowerCase(), person);
  for (const person of people) {
    const key = person.name.toLowerCase();
    const before = merged.get(key);
    merged.set(key, {
      ...before,
      ...person,
      // Amit korábban tudtunk, azt ne veszítsük el egy hiányosabb találattól.
      linkedinUrl: person.linkedinUrl ?? before?.linkedinUrl ?? null,
      email: person.email ?? before?.email ?? null,
      source: person.source ?? before?.source ?? null,
    });
  }

  const order = { hr: 0, vezetes: 1, egyeb: 2 } as const;
  const list = [...merged.values()].sort(
    (a, b) =>
      order[a.category] - order[b.category] ||
      a.name.localeCompare(b.name, "hu"),
  );

  const now = new Date().toISOString();
  await collection.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        people: list,
        peopleSearchedAt: now,
        peopleSearchResult: list.length ? "found" : "none",
        peopleSearchNote: notes.slice(0, 800) || null,
        updatedAt: now,
      },
    },
  );

  log.info(`kapcsolattartók mentve: ${list.length} fő`, { id });
  rescoreIds([id]);
  return list;
}

/** Forget the manual edits of one contact so the next import restores it. */
export async function resetContact(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const collection = await getContacts();
  const result = await collection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { manualFields: [] } },
  );
  return result.matchedCount === 1;
}

/** Tömeges törlés a kijelölt sorokra. Visszaadja, hány sort törölt. */
/**
 * Tömeges módosítás **egy** adatbázis-hívásból.
 *
 * A soronkénti PATCH 900 sornál 900 kérés lenne, kétszer annyi lekérdezéssel —
 * az Atlas M0-n ez percekig tartana. Itt egy `updateMany` megy, a naplóba pedig
 * egy `insertMany`.
 */
export async function bulkUpdateContacts(
  ids: string[],
  patch: Record<string, unknown>,
  source = "tömeges művelet",
): Promise<{ matched: number; modified: number }> {
  const valid = ids
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  if (!valid.length) return { matched: 0, modified: 0 };

  const now = new Date().toISOString();
  const set: Record<string, unknown> = { updatedAt: now };

  for (const flag of MUTABLE_FLAGS) {
    if (typeof patch[flag] === "boolean") {
      set[flag] = patch[flag];
      if (flag !== "starred") set[`${flag}At`] = patch[flag] ? now : null;
    }
  }
  for (const field of MUTABLE_FIELDS) {
    if (field in patch) set[field] = patch[field];
  }
  if (typeof set.company === "string")
    set.aliases = companyAliases(set.company);

  const changed = Object.keys(set).filter((field) => field !== "updatedAt");
  if (!changed.length) return { matched: 0, modified: 0 };

  const collection = await getContacts();

  // A napló előtte-értékei: csak az érintett mezők, csak az érintett sorokra.
  const projection: Record<string, 1> = { company: 1 };
  for (const field of changed) projection[field] = 1;
  const before = await collection
    .find({ _id: { $in: valid } }, { projection })
    .toArray();

  const touched = MUTABLE_FIELDS.filter((field) => field in set);
  const result = await collection.updateMany(
    { _id: { $in: valid } },
    touched.length
      ? { $set: set, $addToSet: { manualFields: { $each: touched } } }
      : { $set: set },
  );

  // A napló sosem buktathatja meg a mentést.
  void Promise.all(
    before.map((doc) =>
      recordChange(
        String(doc._id),
        doc.company,
        doc as unknown as Record<string, unknown>,
        set,
        source,
      ),
    ),
  ).catch((error: Error) => log.warn(`napló: ${error.message}`));

  log.info(
    `tömeges módosítás: ${result.modifiedCount} sor · ${changed.join(", ")}`,
  );
  rescoreIds(ids);
  return { matched: result.matchedCount, modified: result.modifiedCount };
}

export async function deleteContacts(ids: string[]): Promise<number> {
  const valid = ids
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  if (!valid.length) return 0;
  const collection = await getContacts();
  const result = await collection.deleteMany({ _id: { $in: valid } });
  log.warn(`törlés: ${result.deletedCount} sor`, { ids: ids.slice(0, 10) });
  return result.deletedCount;
}

export async function deleteContact(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const collection = await getContacts();
  const result = await collection.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount === 1;
}

/**
 * Idempotent import: existing rows keep their sent/done/starred state, only
 * the content fields are refreshed. New rows are inserted.
 */
export async function upsertContacts(
  contacts: Contact[],
  options: { prune?: boolean; origin?: "pdf" | "import" } = {},
): Promise<{
  inserted: number;
  updated: number;
  removed: number;
  total: number;
}> {
  if (!contacts.length) {
    return { inserted: 0, updated: 0, removed: 0, total: 0 };
  }
  const collection = await getContacts();
  const now = new Date().toISOString();

  // Hand-edited fields must survive a re-import, so look up what to skip.
  const edited = new Map<string, Set<string>>();
  const existing = await collection
    .find(
      { manualFields: { $exists: true, $ne: [] } },
      { projection: { key: 1, manualFields: 1 } },
    )
    .toArray();
  for (const doc of existing) {
    edited.set(doc.key, new Set(doc.manualFields ?? []));
  }

  const operations = contacts.map((contact) => {
    const { sent, sentAt, done, doneAt, starred, createdAt, ...content } =
      contact;
    void sent;
    void sentAt;
    void done;
    void doneAt;
    void starred;
    void createdAt;

    const keep = edited.get(contact.key);
    let payload = keep
      ? (Object.fromEntries(
          Object.entries(content).filter(([field]) => !keep.has(field)),
        ) as typeof content)
      : content;

    // Üres e-mail SOHA nem írhatja felül a meglévőt. A CSV-ből generált sorokban
    // nincs cím — ezek nem tehetik tönkre a kikutatott címeket. Új sornál viszont
    // kellenek a mezők, különben `emails` nélkül jönne létre a dokumentum.
    const blankEmail = !contact.primaryEmail;
    if (blankEmail) {
      const { primaryEmail, emails, ...rest } = payload;
      void primaryEmail;
      void emails;
      payload = rest as typeof content;
    }

    return {
      updateOne: {
        filter: { key: contact.key },
        update: {
          $set: {
            ...payload,
            // Kereshető cégnév-aliasok (jogi forma és írásjelek nélkül) — ezen
            // fut az „megvan-e már?" ellenőrzés, indexből.
            aliases: companyAliases(contact.company),
            origin: options.origin ?? "pdf",
            updatedAt: now,
          },
          $setOnInsert: {
            ...(blankEmail ? { primaryEmail: null, emails: [] } : {}),
            sent: false,
            sentAt: null,
            done: false,
            doneAt: null,
            starred: false,
            createdAt: now,
          },
        },
        upsert: true,
      },
    };
  });

  const result = await collection.bulkWrite(operations, { ordered: false });
  log.info(
    `upsert: ${result.upsertedCount} új, ${result.modifiedCount} frissítve (${contacts.length} sor)`,
    { origin: options.origin ?? "pdf", prune: Boolean(options.prune) },
  );

  // Drop rows that no longer exist in the source PDFs, so re-parsing with a
  // different key scheme can never leave duplicates behind.
  let removed = 0;
  if (options.prune) {
    // Never prune manually imported rows — they have no PDF to come back from.
    const keys = contacts.map((contact) => contact.key);
    const deletion = await collection.deleteMany({
      key: { $nin: keys },
      origin: { $ne: "import" },
    });
    removed = deletion.deletedCount;
  }

  // Új vagy frissült sorok pontszáma: az érintett kulcsokra, a háttérben.
  void rescore({
    key: { $in: contacts.map((contact) => contact.key) },
  } as Filter<Contact>).catch((error: Error) =>
    log.warn(`pontszám importkor: ${error.message}`),
  );

  return {
    inserted: result.upsertedCount,
    updated: result.modifiedCount,
    removed,
    total: contacts.length,
  };
}

/** Szűrőkkel is hívható: ilyenkor csak a szűrt halmazra számol. */
export async function getStats(filters: ContactFilters = {}): Promise<Stats> {
  const collection = await getContacts();
  const query = buildQuery(filters);
  const match = Object.keys(query).length ? [{ $match: query }] : [];

  const [totals] = await collection
    .aggregate<{
      total: number;
      done: number;
      sent: number;
      replied: number;
      bounced: number;
      starred: number;
      withEmail: number;
    }>([
      ...match,
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          done: { $sum: { $cond: ["$done", 1, 0] } },
          sent: { $sum: { $cond: ["$sent", 1, 0] } },
          replied: { $sum: { $cond: [{ $gt: ["$repliedAt", null] }, 1, 0] } },
          bounced: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$bouncedAt", null] },
                    { $not: [{ $gt: ["$repliedAt", null] }] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          starred: { $sum: { $cond: ["$starred", 1, 0] } },
          withEmail: {
            $sum: { $cond: [{ $ne: ["$primaryEmail", null] }, 1, 0] },
          },
        },
      },
      { $project: { _id: 0 } },
    ])
    .toArray();

  const bySource = await collection
    .aggregate<{ _id: string; count: number; done: number; sent: number }>([
      ...match,
      {
        $group: {
          _id: "$source",
          count: { $sum: 1 },
          done: { $sum: { $cond: ["$done", 1, 0] } },
          sent: { $sum: { $cond: ["$sent", 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  return {
    total: totals?.total ?? 0,
    done: totals?.done ?? 0,
    sent: totals?.sent ?? 0,
    replied: totals?.replied ?? 0,
    bounced: totals?.bounced ?? 0,
    starred: totals?.starred ?? 0,
    withEmail: totals?.withEmail ?? 0,
    bySource,
  };
}

export async function facetValues(): Promise<{
  categories: string[];
  cities: string[];
  tags: string[];
  countries: string[];
  sizes: string[];
  sources: string[];
}> {
  const collection = await getContacts();
  const [categories, cities, tags, countries, sizes, sources] =
    await Promise.all([
      collection.distinct("category"),
      collection.distinct("city"),
      collection.distinct("tags"),
      collection.distinct("country"),
      collection.distinct("size"),
      collection.distinct("source"),
    ]);

  const clean = (values: unknown[]) =>
    values
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .sort();

  return {
    categories: clean(categories),
    cities: clean(cities),
    tags: clean(tags),
    countries: clean(countries),
    // Keep the buckets in head-count order, not alphabetical.
    sizes: COMPANY_SIZES.filter((size) => sizes.includes(size)),
    sources: clean(sources),
  };
}
