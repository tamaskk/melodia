/**
 * A megkeresésekhez tartozó levelek tárolása és lekérdezése.
 *
 * Csak az kerül ide, ami ehhez az alkalmazáshoz kötődik: a kiküldött
 * jelentkezések, az azokra érkező válaszok, és amit én válaszoltam rájuk.
 * A postafiók többi levele meg sem érkezik az adatbázisba — a szűrés már a
 * begyűjtésnél megtörténik (lásd `inbox.ts`).
 */
import { ObjectId, type Collection } from "mongodb";
import { getContacts, getDb } from "./mongodb";
import { rescoreIds } from "./contacts";

export interface MailAddress {
  name: string | null;
  address: string;
}

export type MailDirection = "in" | "out";

/** Miért tartozik ez a levél a megkereséshez. */
export type MailMatch = "cim" | "szal" | "domain";

export interface MailMessage {
  /** Stabil kulcs: a Gmail sorszáma a postafiókon belül. */
  key: string;
  mailbox: string;
  uid: number;
  uidValidity: string;
  /** Gmail beszélgetésazonosító (X-GM-THRID) — ez fogja össze a szálat. */
  threadId: string;
  messageId: string | null;
  direction: MailDirection;
  from: MailAddress;
  to: MailAddress[];
  subject: string;
  date: string;
  text: string;
  snippet: string;
  attachments: string[];
  /** A másik fél címe — a szál névjegye. */
  counterpart: string;
  contactId: string | null;
  company: string | null;
  bounce: boolean;
  auto: boolean;
  matchedBy: MailMatch;
  createdAt: string;
}

export type ThreadStatus =
  "nincs-valasz" | "valasz-var" | "valaszoltam" | "visszapattant";

export interface MailThread {
  threadId: string;
  subject: string;
  counterpart: string;
  company: string | null;
  contactId: string | null;
  firstAt: string;
  lastAt: string;
  messages: number;
  incoming: number;
  outgoing: number;
  bounced: boolean;
  /** Csak automatikus válasz jött (szabadság, robot) — nem igazi válasz. */
  autoOnly: boolean;
  status: ThreadStatus;
  lastDirection: MailDirection;
  preview: string;
}

export interface MailStats {
  threads: number;
  answered: number;
  waiting: number;
  bounced: number;
  silent: number;
  /** Válaszarány százalékban, a visszapattanók nélkül. */
  replyRate: number;
}

/** A postafiók-olvasás helye: meddig jutottunk el egy mappában. */
export interface MailboxState {
  path: string;
  uidValidity: string;
  lastUid: number;
  syncedAt: string;
}

let ready: Promise<void> | null = null;

export async function mailCollection(): Promise<Collection<MailMessage>> {
  const db = await getDb();
  const collection = db.collection<MailMessage>("mail");

  ready ??= (async () => {
    await Promise.all([
      collection.createIndex({ key: 1 }, { unique: true }),
      collection.createIndex({ threadId: 1, date: 1 }),
      collection.createIndex({ date: -1 }),
      collection.createIndex({ contactId: 1, date: -1 }),
      collection.createIndex({ counterpart: 1, date: -1 }),
    ]);
  })().catch(() => {
    ready = null;
  });
  await ready;

  return collection;
}

async function stateCollection(): Promise<Collection<MailboxState>> {
  const db = await getDb();
  return db.collection<MailboxState>("mailstate");
}

export async function readMailboxState(
  path: string,
): Promise<MailboxState | null> {
  const collection = await stateCollection();
  return collection.findOne({ path });
}

export async function writeMailboxState(state: MailboxState): Promise<void> {
  const collection = await stateCollection();
  await collection.updateOne(
    { path: state.path },
    { $set: state },
    { upsert: true },
  );
}

/**
 * A szálösszegzés gyorsítótára. Az Atlas M0-n maga az összesítés ~2,5 mp, és
 * az adat csak begyűjtéskor változik — szűrésnél és keresésnél kár újra
 * végigfuttatni.
 */
let cache: { at: number; threads: MailThread[]; stats: MailStats } | null =
  null;
const CACHE_MS = 60_000;

export function invalidateThreadCache(): void {
  cache = null;
}

/** Új levelek beírása. A már meglévőket nem bántjuk. */
export async function saveMessages(messages: MailMessage[]): Promise<number> {
  if (!messages.length) return 0;
  const collection = await mailCollection();
  const result = await collection.bulkWrite(
    messages.map((message) => ({
      updateOne: {
        filter: { key: message.key },
        update: { $setOnInsert: message },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  if (result.upsertedCount) invalidateThreadCache();
  return result.upsertedCount;
}

export interface ThreadFilters {
  /** Szabadszavas keresés cégre, címre, tárgyra. */
  q?: string;
  status?: ThreadStatus | "";
  /** Csak azok a szálak, ahol emberi válasz jött, és az elutasítás volt. */
  rejected?: boolean;
  limit?: number;
}

/**
 * Akik elutasítottak: kézzel rögzített kimenetel, vagy — ha kimenetel még
 * nincs — az osztályozó ítélete a legutóbbi válaszról. Csak azonosítót hozunk.
 */
async function rejectedContactIds(): Promise<Set<string>> {
  const contacts = await getContacts();
  const rows = await contacts
    .find(
      {
        $or: [
          { outcome: "elutasitva" },
          { outcome: null, "replyTriage.category": "elutasitas" },
        ],
      } as never,
      { projection: { _id: 1 } },
    )
    .toArray();
  return new Set(rows.map((row) => String(row._id)));
}

function statusOf(thread: {
  humanIncoming: number;
  bounced: boolean;
  lastHumanIn: string | null;
  lastOut: string | null;
}): ThreadStatus {
  if (thread.bounced && thread.humanIncoming === 0) return "visszapattant";
  if (thread.humanIncoming === 0) return "nincs-valasz";
  // Válasz jött: az a kérdés, reagáltam-e rá azóta.
  if (
    thread.lastOut &&
    thread.lastHumanIn &&
    thread.lastOut > thread.lastHumanIn
  ) {
    return "valaszoltam";
  }
  return "valasz-var";
}

/** Amit a szálösszegzésből visszakapunk — a Mongo már összesítve adja. */
interface ThreadRow {
  _id: string;
  subject: string;
  firstAt: string;
  lastAt: string;
  messages: number;
  incoming: number;
  outgoing: number;
  humanIncoming: number;
  bounced: boolean;
  lastHumanIn: string | null;
  lastOut: string | null;
  company: string | null;
  contactId: string | null;
  outAddress: string | null;
  anyAddress: string;
  preview: string;
  lastDirection: MailDirection;
}

/**
 * Szálak listája, a legutóbbi mozgás elöl.
 *
 * Az összegzés a Mongóban készül el: az Atlas M0 hálózata lassú, és a levelek
 * áthúzása csak azért, hogy itt megszámoljuk őket, másodperceket vinne el.
 */
export async function listThreads(
  filters: ThreadFilters = {},
): Promise<{ threads: MailThread[]; stats: MailStats }> {
  const rejected = filters.rejected ? await rejectedContactIds() : null;
  const cached = cache && Date.now() - cache.at < CACHE_MS ? cache : null;
  if (cached) {
    return applyFilters(cached.threads, cached.stats, filters, rejected);
  }

  const collection = await mailCollection();

  const isIn = { $eq: ["$direction", "in"] };
  const isHuman = {
    $and: [isIn, { $ne: ["$auto", true] }, { $ne: ["$bounce", true] }],
  };

  const rows = (await collection
    .aggregate([
      { $sort: { date: 1 } },
      {
        $group: {
          _id: "$threadId",
          subject: { $first: "$subject" },
          firstAt: { $first: "$date" },
          lastAt: { $last: "$date" },
          messages: { $sum: 1 },
          incoming: { $sum: { $cond: [isIn, 1, 0] } },
          outgoing: { $sum: { $cond: [isIn, 0, 1] } },
          humanIncoming: { $sum: { $cond: [isHuman, 1, 0] } },
          bounced: { $max: { $cond: [{ $eq: ["$bounce", true] }, 1, 0] } },
          lastHumanIn: { $max: { $cond: [isHuman, "$date", null] } },
          lastOut: { $max: { $cond: [isIn, null, "$date"] } },
          company: { $max: "$company" },
          contactId: { $max: "$contactId" },
          // A cég címe a kimenő levélből a legmegbízhatóbb.
          outAddress: { $max: { $cond: [isIn, null, "$counterpart"] } },
          anyAddress: { $first: "$counterpart" },
          preview: { $last: "$snippet" },
          lastDirection: { $last: "$direction" },
        },
      },
      { $sort: { lastAt: -1 } },
    ])
    .toArray()) as unknown as ThreadRow[];

  const threads: MailThread[] = rows.map((row) => ({
    threadId: row._id,
    subject: row.subject || "(nincs tárgy)",
    counterpart: row.outAddress ?? row.anyAddress ?? "",
    company: row.company ?? null,
    contactId: row.contactId ?? null,
    firstAt: row.firstAt,
    lastAt: row.lastAt,
    messages: row.messages,
    incoming: row.incoming,
    outgoing: row.outgoing,
    bounced: Boolean(row.bounced),
    autoOnly: row.incoming > 0 && row.humanIncoming === 0,
    status: statusOf({
      humanIncoming: row.humanIncoming,
      bounced: Boolean(row.bounced),
      lastHumanIn: row.lastHumanIn,
      lastOut: row.lastOut,
    }),
    lastDirection: row.lastDirection,
    preview: row.preview ?? "",
  }));

  // A statisztika a teljes halmazra vonatkozik, nem a szűrt listára — így
  // látszik, mennyi az összes megkeresés, miközben egy állapotra szűrsz.
  const stats: MailStats = {
    threads: threads.length,
    answered: threads.filter(
      (thread) =>
        thread.status === "valaszoltam" || thread.status === "valasz-var",
    ).length,
    waiting: threads.filter((thread) => thread.status === "valasz-var").length,
    bounced: threads.filter((thread) => thread.status === "visszapattant")
      .length,
    silent: threads.filter((thread) => thread.status === "nincs-valasz").length,
    replyRate: 0,
  };
  const delivered = stats.threads - stats.bounced;
  stats.replyRate =
    delivered > 0 ? Math.round((stats.answered / delivered) * 100) : 0;

  cache = { at: Date.now(), threads, stats };
  return applyFilters(threads, stats, filters, rejected);
}

/** Állapot- és szövegszűrés a kész listán. */
function applyFilters(
  threads: MailThread[],
  stats: MailStats,
  filters: ThreadFilters,
  rejected: Set<string> | null,
): { threads: MailThread[]; stats: MailStats } {
  let rows = threads;
  if (rejected) {
    rows = rows.filter(
      (thread) =>
        thread.contactId !== null &&
        rejected.has(thread.contactId) &&
        (thread.status === "valasz-var" || thread.status === "valaszoltam"),
    );
  }
  if (filters.status) {
    rows = rows.filter((thread) => thread.status === filters.status);
  }
  if (filters.q?.trim()) {
    const needle = filters.q.trim().toLowerCase();
    rows = rows.filter((thread) =>
      [thread.company, thread.counterpart, thread.subject, thread.preview]
        .filter(Boolean)
        .some((field) => (field as string).toLowerCase().includes(needle)),
    );
  }
  return { threads: rows.slice(0, filters.limit ?? 500), stats };
}

/** Egy nap két száma a diagramhoz. */
export interface DailyPoint {
  /** ÉÉÉÉ-HH-NN, helyi dátum szerint. */
  day: string;
  /** Ennyi levelet küldtem ki aznap. */
  sent: number;
  /** Ennyi válasz jött aznap (a visszapattanók nélkül). */
  replies: number;
}

/**
 * Napi bontás: mennyi ment ki, és mennyi jött vissza.
 *
 * A hiányzó napokat is visszaadjuk nullával, különben a diagram összenyomná a
 * csendes napokat, és sűrűbbnek látszana a levelezés, mint amilyen.
 */
export async function dailyCounts(days = 30): Promise<DailyPoint[]> {
  const collection = await mailCollection();
  const from = new Date(Date.now() - (days - 1) * 86_400_000);
  from.setHours(0, 0, 0, 0);

  const rows = (await collection
    .aggregate([
      { $match: { date: { $gte: from.toISOString() } } },
      {
        $group: {
          // A dátum ISO szövegként van tárolva; az első tíz karakter a nap.
          _id: {
            day: { $substrCP: ["$date", 0, 10] },
            direction: "$direction",
          },
          count: { $sum: 1 },
          bounced: { $sum: { $cond: [{ $eq: ["$bounce", true] }, 1, 0] } },
        },
      },
    ])
    .toArray()) as {
    _id: { day: string; direction: string };
    count: number;
    bounced: number;
  }[];

  const byDay = new Map<string, DailyPoint>();
  for (const row of rows) {
    const day = row._id.day;
    const point = byDay.get(day) ?? { day, sent: 0, replies: 0 };
    if (row._id.direction === "out") point.sent += row.count;
    // A visszapattanó levél nem válasz — a kézbesítés kudarca.
    else point.replies += row.count - row.bounced;
    byDay.set(day, point);
  }

  const out: DailyPoint[] = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(from.getTime() + index * 86_400_000);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    out.push(byDay.get(day) ?? { day, sent: 0, replies: 0 });
  }
  return out;
}

/** Egy szál összes levele, időrendben. */
export async function threadMessages(threadId: string): Promise<MailMessage[]> {
  const collection = await mailCollection();
  return collection
    .find({ threadId }, { projection: { _id: 0 } })
    .sort({ date: 1 })
    .toArray();
}

/**
 * A levelezés eredménye vissza a kontakt sorra: válaszolt-e, visszapattant-e.
 *
 * Enélkül a lista nem tudja, ki válaszolt, a visszapattant cím „érvényes”
 * marad, és se follow-up, se válaszarány nem számolható. Egy összegzés a
 * Mongóban (kontaktonként), és egyetlen `bulkWrite` — néhány száz sor.
 * Csak a levelezésből származó mezőket írja (`repliedAt`, `bouncedAt`), a kézi
 * kimenetelhez (`outcome`) nem nyúl.
 */
export async function syncContactReplies(): Promise<{
  contacts: number;
  replied: number;
  bounced: number;
  /** Ment neki levél (a Gmail szerint), de a sor nem volt elküldöttnek jelölve. */
  markedSent: number;
}> {
  const collection = await mailCollection();
  const isIn = { $eq: ["$direction", "in"] };
  const isHuman = {
    $and: [isIn, { $ne: ["$auto", true] }, { $ne: ["$bounce", true] }],
  };

  // Előbb szálanként: a kontakt-azonosító rendszerint csak a kimenő levélen
  // van, a válaszon nincs — a szál köti össze a kettőt (ugyanígy, mint a /mail).
  const rows = await collection
    .aggregate<{
      _id: string;
      lastHumanIn: string | null;
      lastBounce: string | null;
      lastOut: string | null;
    }>([
      {
        $group: {
          _id: "$threadId",
          contactId: { $max: "$contactId" },
          lastHumanIn: { $max: { $cond: [isHuman, "$date", null] } },
          lastBounce: {
            $max: { $cond: [{ $eq: ["$bounce", true] }, "$date", null] },
          },
          lastOut: { $max: { $cond: [isIn, null, "$date"] } },
        },
      },
      { $match: { contactId: { $ne: null } } },
      {
        $group: {
          _id: "$contactId",
          lastHumanIn: { $max: "$lastHumanIn" },
          lastBounce: { $max: "$lastBounce" },
          lastOut: { $max: "$lastOut" },
        },
      },
    ])
    .toArray();

  const valid = rows.filter((row) => ObjectId.isValid(row._id));
  if (!valid.length)
    return { contacts: 0, replied: 0, bounced: 0, markedSent: 0 };

  const contacts = await getContacts();
  await contacts.bulkWrite(
    valid.map((row) => ({
      updateOne: {
        filter: { _id: new ObjectId(row._id) },
        update: {
          $set: {
            repliedAt: row.lastHumanIn ?? null,
            // Ha válasz jött, a visszapattanás már nem számít (másik címről jött).
            bouncedAt: row.lastHumanIn ? null : (row.lastBounce ?? null),
          },
        },
      },
    })),
    { ordered: false },
  );

  // Akinek a Gmail szerint ment tőlünk levél (kézzel, más fiókból, a mailto-
  // gombbal), annak a sora is legyen elküldött — különben a kampány újra
  // küldene neki, és a válaszarány 100% fölé menne.
  const outgoing = valid.filter((row) => row.lastOut);
  let markedSent = 0;
  if (outgoing.length) {
    const result = await contacts.bulkWrite(
      outgoing.map((row) => ({
        updateOne: {
          filter: { _id: new ObjectId(row._id), sent: { $ne: true } },
          update: {
            $set: {
              sent: true,
              sentAt: row.lastOut,
              done: true,
              doneAt: row.lastOut,
            },
            $addToSet: { tags: "levelezesbol-elkuldve" },
          },
        },
      })),
      { ordered: false },
    );
    markedSent = result.modifiedCount;
  }

  // Ha a szálban a válasz után tőled ment levél, a választ már kezelted — ne
  // szerepeljen az „új válaszok” között (a /mail „válaszoltam” állapota is ez).
  const answered = valid.filter(
    (row) => row.lastHumanIn && row.lastOut && row.lastOut > row.lastHumanIn,
  );
  if (answered.length) {
    await contacts.bulkWrite(
      answered.map((row) => ({
        updateOne: {
          filter: {
            _id: new ObjectId(row._id),
            $or: [
              { replyHandledAt: null },
              { replyHandledAt: { $lt: row.lastOut } },
            ],
          } as never,
          update: { $set: { replyHandledAt: row.lastOut } },
        },
      })),
      { ordered: false },
    );
  }

  // A visszapattanás a pontszámba is beleszól (score.ts).
  rescoreIds(valid.map((row) => row._id));

  const replied = valid.filter((row) => row.lastHumanIn).length;
  const bounced = valid.filter(
    (row) => !row.lastHumanIn && row.lastBounce,
  ).length;
  return { contacts: valid.length, replied, bounced, markedSent };
}

/**
 * Kontaktonként az első kimenő levél: az azonosítója (a follow-up ehhez fűzi a
 * választ, így egy szálban marad), a tárgya és hogy melyik fiókból ment.
 */
export async function originalOutgoing(
  contactIds: string[],
): Promise<
  Map<string, { messageId: string | null; subject: string; from: string }>
> {
  const result = new Map<
    string,
    { messageId: string | null; subject: string; from: string }
  >();
  if (!contactIds.length) return result;
  const collection = await mailCollection();
  const rows = await collection
    .aggregate<{
      _id: string;
      messageId: string | null;
      subject: string;
      from: string;
    }>([
      { $match: { contactId: { $in: contactIds }, direction: { $ne: "in" } } },
      { $sort: { date: 1 } },
      {
        $group: {
          _id: "$contactId",
          messageId: { $first: "$messageId" },
          subject: { $first: "$subject" },
          from: { $first: "$from.address" },
        },
      },
    ])
    .toArray();
  for (const row of rows) {
    result.set(row._id, {
      messageId: row.messageId ?? null,
      subject: row.subject ?? "",
      from: (row.from ?? "").toLowerCase(),
    });
  }
  return result;
}

export interface LatestReply {
  messageId: string | null;
  subject: string;
  text: string;
  from: string;
  /** Melyik saját címre jött — a válasz ebből a fiókból megy vissza. */
  to: string;
  date: string;
}

/**
 * A válaszlevélből az idézett előzmény levágása („… írta:”, „On … wrote:”,
 * „Feladó:”, „-----Original Message”, „>” sorok) — különben az osztályozó a
 * saját korábbi leveledből is összefoglalna.
 */
export function stripQuoted(text: string): string {
  const cut = text.search(
    /\n[^\n]*(?:^|\s)(írta|wrote|schrieb|escribió)\s*:|\n-{2,}\s*(original message|eredeti üzenet)|\n(feladó|from|von|de)\s*:/i,
  );
  const head = cut > 0 ? text.slice(0, cut) : text;
  return head
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n")
    .trim();
}

/**
 * Kontaktonként a legutóbbi emberi (nem automatikus, nem visszapattanó)
 * beérkező levél. A kontakt-azonosító a szálon át köti össze (a válaszon
 * rendszerint nincs, csak a kimenő levélen).
 */
export async function latestReplies(
  contactIds: string[],
): Promise<Map<string, LatestReply>> {
  const result = new Map<string, LatestReply>();
  if (!contactIds.length) return result;
  const collection = await mailCollection();
  const threads = await collection
    .aggregate<{ _id: string; contactId: string }>([
      { $match: { contactId: { $in: contactIds } } },
      { $group: { _id: "$threadId", contactId: { $max: "$contactId" } } },
    ])
    .toArray();
  const contactOf = new Map(
    threads.map((thread) => [thread._id, thread.contactId]),
  );
  const messages = await collection
    .find(
      {
        threadId: { $in: [...contactOf.keys()] },
        direction: "in",
        auto: { $ne: true },
        bounce: { $ne: true },
      },
      {
        projection: {
          threadId: 1,
          messageId: 1,
          subject: 1,
          text: 1,
          from: 1,
          to: 1,
          date: 1,
        },
      },
    )
    .sort({ date: -1 })
    .toArray();
  for (const message of messages) {
    const contactId = contactOf.get(message.threadId);
    if (!contactId || result.has(contactId)) continue;
    result.set(contactId, {
      messageId: message.messageId ?? null,
      subject: message.subject ?? "",
      text: stripQuoted(message.text ?? "").slice(0, 6000),
      from: message.from?.address ?? "",
      to: message.to?.[0]?.address ?? "",
      date: message.date,
    });
  }
  return result;
}

/** A fiók legelső kimenő levele a szinkron szerint — a felfuttatás kezdete. */
export async function firstOutgoingFrom(
  address: string,
): Promise<string | null> {
  const collection = await mailCollection();
  const [first] = await collection
    .find(
      { direction: { $ne: "in" }, "from.address": address.toLowerCase() },
      { projection: { date: 1 } },
    )
    .sort({ date: 1 })
    .limit(1)
    .toArray();
  return first?.date ?? null;
}

/** Egy kontakt teljes levélváltása időrendben, idézett előzmények nélkül. */
export async function conversation(
  contactId: string,
  limit = 12,
): Promise<
  {
    direction: MailDirection;
    from: string;
    date: string;
    subject: string;
    text: string;
  }[]
> {
  const collection = await mailCollection();
  const threads = await collection.distinct("threadId", { contactId });
  if (!threads.length) return [];
  const messages = await collection
    .find(
      { threadId: { $in: threads }, bounce: { $ne: true } },
      { projection: { direction: 1, from: 1, date: 1, subject: 1, text: 1 } },
    )
    .sort({ date: 1 })
    .toArray();
  return messages.slice(-limit).map((message) => ({
    direction: message.direction,
    from: message.from?.address ?? "",
    date: message.date,
    subject: message.subject ?? "",
    text: stripQuoted(message.text ?? "").slice(0, 2500),
  }));
}
