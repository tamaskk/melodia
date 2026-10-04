/**
 * Változásnapló: mi változott, mikor, mire — és visszaállítható.
 *
 * Minden mezőmódosítás bekerül (előtte/utána értékkel), így egy elkapkodott
 * tömeges kattintás nem visszafordíthatatlan. A bejegyzések 30 nap után
 * automatikusan törlődnek (TTL index).
 */
import { ObjectId, type Collection } from "mongodb";
import { createLogger } from "./logger";
import { getDb } from "./mongodb";

const log = createLogger("naplo");

export interface ChangeEntry {
  _id?: ObjectId;
  contactId: string;
  company: string;
  field: string;
  before: unknown;
  after: unknown;
  /** Honnan jött: kézi szerkesztés, tömeges művelet, sablon, küldés, keresés. */
  source: string;
  at: string;
  /** Igaz, ha ezt a bejegyzést már visszaállítottuk. */
  reverted?: boolean;
}

export interface ChangeDoc extends Omit<ChangeEntry, "_id"> {
  _id: string;
}

let ready: Promise<void> | null = null;

async function changes(): Promise<Collection<ChangeEntry>> {
  const db = await getDb();
  const collection = db.collection<ChangeEntry>("changes");

  ready ??= (async () => {
    await Promise.all([
      collection.createIndex({ at: -1 }),
      collection.createIndex({ contactId: 1, at: -1 }),
      collection.createIndex({ field: 1, at: -1 }),
      // 30 nap után magától eltűnik — ez napló, nem archívum.
      collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 30 * 86400 }),
    ]);
  })().catch(() => {
    ready = null;
  });
  await ready;

  return collection;
}

/** Ezeket nem naplózzuk: technikai zaj, nem érdemi változás. */
const IGNORED = new Set([
  "updatedAt",
  "manualFields",
  "emailSearch",
  "emailSearchedAt",
  // Ezek a done/sent kísérői — velük együtt állnak vissza, külön sorként zaj.
  "doneAt",
  "sentAt",
]);

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  return a === b;
}

/** Egy mentés naplózása. Csak a ténylegesen változó mezőket írja be. */
export async function recordChange(
  contactId: string,
  company: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  source: string,
): Promise<void> {
  const entries: (ChangeEntry & { createdAt: Date })[] = [];
  const at = new Date().toISOString();

  for (const [field, value] of Object.entries(after)) {
    if (IGNORED.has(field)) continue;
    if (same(before[field], value)) continue;
    entries.push({
      contactId,
      company,
      field,
      before: before[field] ?? null,
      after: value ?? null,
      source,
      at,
      createdAt: new Date(),
    });
  }

  if (!entries.length) return;
  const collection = await changes();
  await collection.insertMany(entries);
}

export interface HistoryFilters {
  /** ISO időpont — ennél frissebb bejegyzések. */
  since?: string;
  field?: string;
  contactId?: string;
  source?: string;
  limit?: number;
}

export async function listChanges(filters: HistoryFilters = {}): Promise<ChangeDoc[]> {
  const collection = await changes();
  const query: Record<string, unknown> = {};
  if (filters.since) query.at = { $gte: filters.since };
  if (filters.field) query.field = filters.field;
  if (filters.contactId) query.contactId = filters.contactId;
  if (filters.source) query.source = { $regex: filters.source };

  const docs = await collection
    .find(query)
    .sort({ at: -1 })
    .limit(Math.min(500, filters.limit ?? 200))
    .toArray();

  return docs.map(({ _id, ...rest }) => ({ ...rest, _id: _id!.toString() }));
}

/** Milyen mezőket és forrásokat találunk a naplóban — a szűrőkhöz. */
export async function historyFacets(): Promise<{ fields: string[]; sources: string[] }> {
  const collection = await changes();
  const [fields, sources] = await Promise.all([
    collection.distinct("field"),
    collection.distinct("source"),
  ]);
  return { fields: fields.sort(), sources: sources.sort() };
}

/**
 * Visszaállítás: a mező visszakapja a `before` értéket. A visszaállítás maga is
 * naplózódik (`source: "visszaállítás"`), tehát az is visszavonható.
 */
export async function revertChanges(
  ids: string[],
): Promise<{ reverted: number; skipped: number }> {
  const collection = await changes();
  const { updateContact } = await import("./contacts");

  const valid = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  const docs = await collection.find({ _id: { $in: valid } }).toArray();

  let reverted = 0;
  let skipped = 0;

  // Időrendben visszafelé, hogy több egymásra épülő változás is helyreálljon.
  for (const doc of docs.sort((a, b) => b.at.localeCompare(a.at))) {
    if (doc.reverted) {
      skipped += 1;
      continue;
    }
    const patch: Record<string, unknown> = { [doc.field]: doc.before };
    // A "kész"/"elküldve" mellé a hozzájuk tartozó időbélyeg is visszaáll.
    if (doc.field === "done" && doc.before === false) patch.doneAt = null;
    if (doc.field === "sent" && doc.before === false) patch.sentAt = null;

    const updated = await updateContact(doc.contactId, patch, "visszaállítás");
    if (!updated) {
      skipped += 1;
      continue;
    }
    await collection.updateOne({ _id: doc._id }, { $set: { reverted: true } });
    reverted += 1;
  }

  log.info(`visszaállítva: ${reverted} változás${skipped ? `, kihagyva ${skipped}` : ""}`);
  return { reverted, skipped };
}
