/**
 * Időzített válaszok meglévő szálakba (`thread_replies`).
 *
 * A levelezés oldalán kijelölt szálakra a FreeLLMAPI ír piszkozatot (a teljes
 * szálból); jóváhagyás után a levél annak a fióknak a
 * következő szabad helyén megy ki, amelyikre a válasz érkezett — a szálban, a
 * kiválasztott csatolmányokkal.
 *
 * A betervezett első levelek elsőbbséget élveznek: ez csak a nap megmaradt
 * keretét használja, a küldési ablakban, a címzett munkaidejében.
 *
 * Felvenni, átírni és jóváhagyni bármelyik példányról lehet; írni és küldeni
 * csak a saját gép tud (ott fut a FreeLLMAPI, és ott van az `attachments/` mappa).
 */
import { ObjectId, type Collection } from "mongodb";
import { ensureAccounts, getAccount, listAccounts } from "./accounts";
import { availableAttachments } from "./attachmentIndex";
import { resolveSelection } from "./attachments";
import { getContactById } from "./contacts";
import { createLogger } from "./logger";
import { mailCollection, stripQuoted, threadMessages } from "./mailStore";
import { sendFollowUpEmail } from "./mailer";
import { getContacts, getDb } from "./mongodb";
import { QUEUE_WINDOW_FROM, QUEUE_WINDOW_TO, dayKey } from "./queuePlan";
import { recordSendFailure } from "./queueStats";
import {
  assertLlmReachable,
  generateReplyDraft,
  isReplyLlmReady,
} from "./replyLlm";
import { claimSender, isSender } from "./role";
import { campaignState } from "./sendCampaign";
import { liveUsage } from "./sendQueues";
import { insideWindowAt, timeZoneFor } from "./sendWindow";
import {
  APPROVABLE,
  EDITABLE,
  isNoReply,
  LANGUAGE_ATTACHMENT,
  replySubject,
  roomToday,
  type ThreadReplyStatus,
} from "./threadReplyDraft";
import { warmupCap } from "./warmup";
import { dayRange } from "./widgetQueues";

const log = createLogger("szalvalasz");

/** Ennyi idő teljen el egy fiók két időzített válasza között. */
const GAP_MS = 10 * 60_000;
const TICK_MS = 2 * 60_000;
/** FreeLLMAPI-val egyszerre ennyi piszkozat készül — egy nagy kijelölés ne égesse el egyszerre a free keretet. */
const LLM_CONCURRENCY = 2;
/** Egy hívásban legfeljebb ennyi FreeLLMAPI-piszkozat (≈ 10 / perc). */
const LLM_DRAFTS_PER_RUN = 30;
/** A soron kívüli válaszok köre: ennyi időnként néz rá a küldő gép. */
const PRIORITY_TICK_MS = 20_000;
/** Egy kéréssel ennyi szál időzíthető. */
export const MAX_PER_REQUEST = 100;

export interface ThreadReply {
  threadId: string;
  contactId: string | null;
  company: string;
  /** Amelyik fiókra a válasz jött — innen megy vissza. */
  accountId: string;
  to: string;
  toName: string | null;
  subject: string;
  body: string;
  language: string | null;
  /** A levél, amire válaszolunk: ehhez fűzzük, és ebből látszik, jött-e újabb. */
  inReplyTo: string | null;
  repliedToAt: string;
  excerpt: string;
  /** Az `attachments/` mappához relatív nevek. */
  attachments: string[];
  status: ThreadReplyStatus;
  /**
   * Soron kívül: jóváhagyás után azonnal megy, a cold queue mellett, a napi
   * keret, a küldési ablak és a 10 perces szünet nélkül.
   */
  priority?: boolean;
  /**
   * A queue-ban: külön sáv fiókonként, a cold queue mellett, a saját ütemében —
   * ugyanaz a szünet és munkaidő-ablak, de a napi keretbe nem számít.
   */
  inQueue?: boolean;
  /** A válasz-queue napja (`YYYY-MM-DD`, budapesti idő): előbb nem megy ki. */
  queueDay?: string | null;
  note: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  sentAt: string | null;
  messageId: string | null;
}

export type ThreadReplyRow = Omit<ThreadReply, "inReplyTo"> & {
  id: string;
  accountLabel: string;
};

let ready: Promise<void> | null = null;

async function replies(): Promise<Collection<ThreadReply>> {
  const collection = (await getDb()).collection<ThreadReply>("thread_replies");
  ready ??= Promise.all([
    // Szálanként egy: aki már kapott vagy be van időzítve, az nem jelölhető újra.
    collection.createIndex({ threadId: 1 }, { unique: true }),
    collection.createIndex({ status: 1, accountId: 1, sentAt: 1 }),
  ])
    .then(() => undefined)
    .catch(() => {
      ready = null;
    });
  await ready;
  return collection;
}

interface Incoming {
  threadId: string;
  messageId: string | null;
  subject: string;
  text: string;
  from: string;
  fromName: string | null;
  to: string[];
  date: string;
  contactId: string | null;
  company: string | null;
}

/**
 * Szálanként a legutóbbi emberi (nem automatikus, nem visszapattanó) beérkező
 * levél. A kontakt a szál bármelyik leveléről jöhet — a válaszon rendszerint
 * nincs rajta, csak a kimenőn.
 */
async function latestIncoming(
  threadIds: string[],
): Promise<Map<string, Incoming>> {
  const result = new Map<string, Incoming>();
  if (!threadIds.length) return result;
  const collection = await mailCollection();
  const [messages, owners] = await Promise.all([
    collection
      .find(
        {
          threadId: { $in: threadIds },
          direction: "in",
          auto: { $ne: true },
          bounce: { $ne: true },
        },
        {
          projection: {
            _id: 0,
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
      .sort({ threadId: 1, date: -1 })
      .toArray(),
    collection
      .aggregate<{
        _id: string;
        contactId: string | null;
        company: string | null;
      }>([
        { $match: { threadId: { $in: threadIds } } },
        {
          $group: {
            _id: "$threadId",
            contactId: { $max: "$contactId" },
            company: { $max: "$company" },
          },
        },
      ])
      .toArray(),
  ]);
  const ownerOf = new Map(owners.map((row) => [row._id, row]));
  for (const message of messages) {
    if (result.has(message.threadId)) continue;
    const owner = ownerOf.get(message.threadId);
    result.set(message.threadId, {
      threadId: message.threadId,
      messageId: message.messageId ?? null,
      subject: message.subject ?? "",
      text: stripQuoted(message.text ?? "").slice(0, 6000),
      from: (message.from?.address ?? "").toLowerCase(),
      fromName: message.from?.name ?? null,
      to: (message.to ?? []).map((item) => item.address.toLowerCase()),
      date: message.date,
      contactId: owner?.contactId ?? null,
      company: owner?.company ?? null,
    });
  }
  return result;
}

export interface ScheduleResult {
  scheduled: number;
  skipped: { threadId: string; company: string; reason: string }[];
}

/**
 * A kijelölt szálak felvétele. A piszkozatot a küldő gép írja meg; addig a
 * sor „piszkozat készül" állapotban áll.
 */
export async function scheduleThreadReplies(
  threadIds: string[],
  attachments: string[],
): Promise<ScheduleResult> {
  const ids = [...new Set(threadIds.filter(Boolean))].slice(0, MAX_PER_REQUEST);
  await ensureAccounts();
  const accounts = listAccounts();
  const [incoming, collection] = await Promise.all([
    latestIncoming(ids),
    replies(),
  ]);
  const existing = new Set(
    (
      await collection
        .find({ threadId: { $in: ids } }, { projection: { threadId: 1 } })
        .toArray()
    ).map((doc) => doc.threadId),
  );

  const result: ScheduleResult = { scheduled: 0, skipped: [] };
  const now = new Date().toISOString();
  const docs: ThreadReply[] = [];
  for (const threadId of ids) {
    const mail = incoming.get(threadId);
    const company = mail?.company ?? mail?.from ?? threadId;
    const skip = (reason: string) =>
      result.skipped.push({ threadId, company, reason });

    if (existing.has(threadId)) {
      skip("erre a szálra már van időzített vagy kiment levél");
      continue;
    }
    if (!mail || !mail.from) {
      skip("nincs a szálban emberi válasz, amire felelni lehetne");
      continue;
    }
    if (isNoReply(mail.from)) {
      skip(`robotcímről jött (${mail.from}) — arra nem megy válasz`);
      continue;
    }
    const account = accounts.find((item) =>
      mail.to.includes(item.user.toLowerCase()),
    );
    if (!account) {
      skip("nem találom a fiókot, amelyikre a válasz érkezett");
      continue;
    }
    docs.push({
      threadId,
      contactId: mail.contactId,
      company,
      accountId: account.id,
      to: mail.from,
      toName: mail.fromName,
      subject: replySubject(mail.subject),
      body: "",
      language: null,
      inReplyTo: mail.messageId,
      repliedToAt: mail.date,
      excerpt: mail.text.slice(0, 1200),
      attachments,
      status: "generalas",
      note: null,
      model: null,
      createdAt: now,
      updatedAt: now,
      approvedAt: null,
      sentAt: null,
      messageId: null,
    });
  }
  if (docs.length) {
    await collection.insertMany(docs);
    result.scheduled = docs.length;
    log.info(`${docs.length} szálra időzítve válasz`);
    // A küldő gépen nem várunk a következő körre.
    void draftPending().catch(() => undefined);
  }
  return result;
}

function row(doc: ThreadReply & { _id: ObjectId }): ThreadReplyRow {
  const { _id, inReplyTo: _inReplyTo, ...rest } = doc;
  void _inReplyTo;
  return {
    ...rest,
    id: _id.toString(),
    accountLabel: getAccount(doc.accountId)?.user ?? doc.accountId,
  };
}

/** A Queue-k oldal listája: minden függő sor, és az utóbbi két hét kiment levelei. */
export async function listThreadReplies(
  now = new Date(),
): Promise<ThreadReplyRow[]> {
  await ensureAccounts();
  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const docs = await (
    await replies()
  )
    .find({
      $or: [{ status: { $ne: "kiment" } }, { sentAt: { $gte: since } }],
    })
    .sort({ createdAt: -1 })
    .limit(300)
    .toArray();
  return docs.map(row);
}

/** Szál → állapot: a levelezés listája ebből rajzol jelvényt. */
export async function threadReplyStatuses(): Promise<
  Record<string, ThreadReplyStatus>
> {
  const docs = await (
    await replies()
  )
    .find({}, { projection: { _id: 0, threadId: 1, status: 1 } })
    .toArray();
  return Object.fromEntries(docs.map((doc) => [doc.threadId, doc.status]));
}

function objectIds(ids: string[]): ObjectId[] {
  return ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
}

/** Hogyan menjen ki a jóváhagyott válasz. */
export type ReplyMode = "idozites" | "queue" | "soron-kivul";

/**
 * Jóváhagyás. `idozites`: a fiók következő szabad helyén, a napi keretből ·
 * `queue`: saját sávban, a cold queue ütemével, keret nélkül · `soron-kivul`:
 * azonnal, keret nélkül.
 */
export async function approveThreadReplies(
  ids: string[],
  mode: ReplyMode = "idozites",
  /** `queue` módban: melyik naptól menjen (`YYYY-MM-DD`). Üresen ma. */
  day?: string,
): Promise<number> {
  const priority = mode === "soron-kivul";
  const now = new Date().toISOString();
  const result = await (
    await replies()
  ).updateMany(
    {
      _id: { $in: objectIds(ids) },
      status: { $in: APPROVABLE },
      body: { $ne: "" },
      // A levél csatolt dokumentumot ígér — anélkül nem hagyható jóvá.
      "attachments.0": { $exists: true },
    },
    {
      $set: {
        status: "jovahagyva",
        priority,
        inQueue: mode === "queue",
        queueDay: mode === "queue" ? (day ?? dayKey(new Date())) : null,
        approvedAt: now,
        updatedAt: now,
        note: null,
      },
    },
  );
  // A küldő gépen nem várunk a következő körre.
  if (priority && result.modifiedCount) {
    void sendPriority().catch(() => undefined);
  }
  return result.modifiedCount;
}

/** Szöveg, tárgy vagy csatolmány átírása — kiküldésig bármikor. */
export async function editThreadReply(
  id: string,
  patch: { subject?: string; body?: string; attachments?: string[] },
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const set: Partial<ThreadReply> = { updatedAt: new Date().toISOString() };
  if (typeof patch.subject === "string" && patch.subject.trim())
    set.subject = patch.subject.trim();
  if (typeof patch.body === "string" && patch.body.trim())
    set.body = patch.body.trim();
  if (Array.isArray(patch.attachments))
    set.attachments = patch.attachments.filter(
      (name) => typeof name === "string" && name,
    );
  const result = await (
    await replies()
  ).updateOne(
    { _id: new ObjectId(id), status: { $in: EDITABLE } },
    { $set: set },
  );
  return result.matchedCount > 0;
}

/** Lemondás: a sor törlődik, a szál újra időzíthető. Ami kiment, az marad. */
export async function cancelThreadReplies(ids: string[]): Promise<number> {
  const result = await (
    await replies()
  ).deleteMany({ _id: { $in: objectIds(ids) }, status: { $ne: "kiment" } });
  return result.deletedCount;
}

/**
 * Új piszkozat a szál MOSTANI utolsó levelére — hiba után, vagy ha közben
 * újabb levél jött. A jóváhagyás elvész: az új szöveget újra át kell nézni.
 */
export async function regenerateThreadReply(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const collection = await replies();
  const doc = await collection.findOne({ _id: new ObjectId(id) });
  if (!doc || doc.status === "kiment") return false;
  const mail = (await latestIncoming([doc.threadId])).get(doc.threadId);
  const now = new Date().toISOString();
  await collection.updateOne(
    { _id: doc._id, status: { $ne: "kiment" } },
    {
      $set: {
        status: "generalas",
        body: "",
        note: null,
        approvedAt: null,
        priority: false,
        inQueue: false,
        queueDay: null,
        updatedAt: now,
        ...(mail
          ? {
              to: mail.from,
              toName: mail.fromName,
              subject: replySubject(mail.subject),
              inReplyTo: mail.messageId,
              repliedToAt: mail.date,
              excerpt: mail.text.slice(0, 1200),
            }
          : {}),
      },
    },
  );
  void draftPending().catch(() => undefined);
  return true;
}

/** Fiókonként a napon kiment válaszok száma és az utolsó ideje — a widgetnek is. */
export async function threadRepliesSentOn(
  day: string,
): Promise<Map<string, { count: number; lastAt: string }>> {
  const range = dayRange(day);
  const rows = await (
    await replies()
  )
    .aggregate<{ _id: string; count: number; lastAt: string }>([
      {
        $match: {
          status: "kiment",
          // A soron kívüliek és a queue-ban mentek nem a fiók keretéből mennek.
          priority: { $ne: true },
          inQueue: { $ne: true },
          sentAt: { $gte: range.start, $lt: range.end },
        },
      },
      {
        $group: {
          _id: "$accountId",
          count: { $sum: 1 },
          lastAt: { $max: "$sentAt" },
        },
      },
    ])
    .toArray();
  return new Map(
    rows.map((item) => [item._id, { count: item.count, lastAt: item.lastAt }]),
  );
}

async function fail(
  doc: ThreadReply & { _id: ObjectId },
  status: "hiba" | "megallt",
  note: string,
): Promise<void> {
  log.warn(`${doc.company}: ${note}`);
  await (
    await replies()
  ).updateOne(
    { _id: doc._id },
    { $set: { status, note, updatedAt: new Date().toISOString() } },
  );
}

/**
 * Stílusminta a FreeLLMAPI-nak: a legutóbbi kiment saját válaszok, nyelvenként
 * kettő — ezek hangját és hosszát kövesse.
 */
async function styleExamples(): Promise<string[]> {
  const collection = await replies();
  const recent = await Promise.all(
    ["hu", "en"].map((language) =>
      collection
        .find(
          { status: "kiment", language },
          { projection: { _id: 0, body: 1 } },
        )
        .sort({ sentAt: -1 })
        .limit(2)
        .toArray(),
    ),
  );
  return recent.flat().map((doc) => doc.body);
}

/** A nyelvhez tartozó bemutatkozó PDF kulcsa, ha megvan a küldő gép mappájában. */
async function languageAttachment(language: string | null): Promise<string[]> {
  const name = LANGUAGE_ATTACHMENT[language ?? ""];
  if (!name) return [];
  const { files } = await availableAttachments();
  const match =
    files.find((file) => file.name === name && file.scope === language) ??
    files.find((file) => file.name === name);
  return match ? [match.key] : [];
}

/** A piszkozat a FreeLLMAPI-val — a teljes szálból, a saját stílusmintákkal. */
async function compose(
  doc: ThreadReply,
): Promise<{ body: string; language: string | null; model: string }> {
  if (!isReplyLlmReady()) {
    throw new Error(
      "Nincs beállítva a FreeLLMAPI: írd be az LLM_BASE_URL-t és az LLM_API_KEY-t az atlas-credentials.env-be, majd indítsd újra a szervert.",
    );
  }
  const [messages, examples] = await Promise.all([
    threadMessages(doc.threadId),
    styleExamples(),
  ]);
  return generateReplyDraft({
    company: doc.company,
    senderName: doc.toName,
    messages,
    styleExamples: examples,
  });
}

/** Egy piszkozat megírása. */
async function writeDraft(doc: ThreadReply & { _id: ObjectId }): Promise<void> {
  const mail = (await latestIncoming([doc.threadId])).get(doc.threadId);
  if (!mail) {
    await fail(doc, "hiba", "Nincs meg a levél, amire válaszolni kellene.");
    return;
  }
  try {
    const draft = await compose(doc);
    // Ha kijelöléskor nem választottál csatolmányt, a nyelv dönt.
    const attachments = doc.attachments.length
      ? doc.attachments
      : await languageAttachment(draft.language);
    // Csak akkor írjuk be, ha közben nem mondták le és nem írták át.
    await (
      await replies()
    ).updateOne(
      { _id: doc._id, status: "generalas" },
      {
        $set: {
          status: "atnezendo",
          body: draft.body,
          language: draft.language,
          attachments,
          model: draft.model,
          note: null,
          updatedAt: new Date().toISOString(),
        },
      },
    );
    const model = draft.model;
    log.info(`piszkozat kész: ${doc.company} (${model})`);
  } catch (error) {
    await fail(
      doc,
      "hiba",
      `A piszkozat nem készült el: ${(error as Error).message}`,
    );
  }
}

/** Egy jóváhagyott levél kiküldése. Igaz, ha tényleg kiment. */
async function sendOne(doc: ThreadReply & { _id: ObjectId }): Promise<boolean> {
  const collection = await replies();

  // Ha az időzítés óta újabb levél jött a szálban, a szöveg már nem arra felel.
  const latest = (await latestIncoming([doc.threadId])).get(doc.threadId);
  if (latest && latest.date > doc.repliedToAt) {
    await fail(
      doc,
      "megallt",
      "Az időzítés óta új levél jött a szálban — nem küldtem el. Nézd meg, és generáld újra, ha még aktuális.",
    );
    return false;
  }

  const { files } = await resolveSelection(doc.attachments);
  if (!doc.attachments.length) {
    await fail(
      doc,
      "hiba",
      "Nincs kiválasztott csatolmány, pedig a levél csatolt dokumentumot ígér — nem küldtem el.",
    );
    return false;
  }
  if (files.length < doc.attachments.length) {
    await fail(
      doc,
      "hiba",
      "Hiányzik egy kiválasztott csatolmány a küldő gép attachments/ mappájából — nem küldtem el nélküle.",
    );
    return false;
  }

  // Lefoglalás: ha a küldés közben a gép leáll, a sor itt marad, és magától
  // nem megy ki még egyszer.
  const claimed = await collection.updateOne(
    { _id: doc._id, status: "jovahagyva" },
    { $set: { status: "kuldes", updatedAt: new Date().toISOString() } },
  );
  if (!claimed.modifiedCount) return false;

  try {
    const result = await sendFollowUpEmail({
      accountId: doc.accountId,
      to: doc.to,
      company: doc.company,
      subject: doc.subject,
      body: doc.body,
      inReplyTo: doc.inReplyTo,
      kind: doc.priority
        ? "soron kívüli válasz"
        : doc.inQueue
          ? "válasz a queue-ban"
          : "időzített válasz",
      files,
    });
    const at = new Date().toISOString();
    await collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          status: "kiment",
          sentAt: at,
          messageId: result.messageId,
          note: null,
          updatedAt: at,
        },
      },
    );
    if (doc.contactId && ObjectId.isValid(doc.contactId)) {
      await (
        await getContacts()
      ).updateOne({ _id: new ObjectId(doc.contactId) }, {
        $set: { threadReplySentAt: at, updatedAt: at },
        $addToSet: { tags: "szalvalasz-kiment" },
      } as never);
    }
    return true;
  } catch (error) {
    recordSendFailure(doc.accountId);
    await fail(doc, "hiba", `Nem ment ki: ${(error as Error).message}`);
    return false;
  }
}

export interface ReplyTick {
  ran: boolean;
  drafted: number;
  sent: number;
}

const flags = globalThis as typeof globalThis & {
  __melodiaReplyTimer?: ReturnType<typeof setInterval>;
  __melodiaReplyTicking?: boolean;
  __melodiaReplyDrafting?: boolean;
  __melodiaPriorityTimer?: ReturnType<typeof setInterval>;
  __melodiaPriorityTicking?: boolean;
  __melodiaLaneTicking?: boolean;
  /** Fiókonként mikor mehet a következő queue-s válasz (epoch ms). */
  __melodiaLaneNext?: Map<string, number>;
};
const laneNext = (flags.__melodiaLaneNext ??= new Map<string, number>());

/**
 * Egy kör: előbb a hiányzó piszkozatok, aztán fiókonként legfeljebb egy
 * jóváhagyott levél — ha van ma szabad hely, és a címzettnél munkaidő van.
 */
/**
 * A hiányzó piszkozatok megírása. Ehhez nem kell küldőnek lenni — csak a helyi
 * FreeLLMAPI kell, így bármelyik saját gépen lefut (a telepített példányon
 * nem). Levél ettől nem megy ki: az a jóváhagyás és a küldő gép dolga.
 */
export async function draftPending(): Promise<number> {
  if (process.env.VERCEL || flags.__melodiaReplyDrafting) return 0;
  flags.__melodiaReplyDrafting = true;
  try {
    const collection = await replies();
    // Kettesével, amíg van függő — a modal ne várjon két percet.
    let done = 0;
    while (done < LLM_DRAFTS_PER_RUN) {
      const batch = await collection
        .find({ status: "generalas" })
        .sort({ createdAt: 1 })
        .limit(LLM_CONCURRENCY)
        .toArray();
      if (!batch.length) break;
      await Promise.all(batch.map(writeDraft));
      done += batch.length;
    }
    return done;
  } finally {
    flags.__melodiaReplyDrafting = false;
  }
}

export async function tickThreadReplies(now = new Date()): Promise<ReplyTick> {
  const result: ReplyTick = { ran: false, drafted: 0, sent: 0 };
  if (!isSender() || flags.__melodiaReplyTicking) return result;
  flags.__melodiaReplyTicking = true;
  try {
    result.drafted = await draftPending();
    const approved = await (
      await replies()
    )
      .find({
        status: "jovahagyva",
        priority: { $ne: true },
        inQueue: { $ne: true },
      })
      .sort({ approvedAt: 1 })
      .toArray();
    if (!approved.length) return result;
    // Egyszerre egy küldő lehet — ugyanaz az életjel, mint a queue-knál.
    if (!(await claimSender(now))) return result;
    result.ran = true;
    await ensureAccounts();

    // A küldő nappalán és hétköznap, mint a queue-k.
    if (
      !insideWindowAt(
        now,
        timeZoneFor(null),
        QUEUE_WINDOW_FROM,
        QUEUE_WINDOW_TO,
      )
    ) {
      return result;
    }

    const today = dayKey(now);
    const [{ used, first }, sentToday] = await Promise.all([
      liveUsage(now),
      threadRepliesSentOn(today),
    ]);
    const byAccount = new Map<string, (ThreadReply & { _id: ObjectId })[]>();
    for (const doc of approved) {
      byAccount.set(doc.accountId, [
        ...(byAccount.get(doc.accountId) ?? []),
        doc,
      ]);
    }

    for (const [accountId, docs] of byAccount) {
      const account = getAccount(accountId);
      if (!account) continue;
      const done = sentToday.get(accountId);
      if (done && now.getTime() - Date.parse(done.lastAt) < GAP_MS) continue;
      // Ha a fiók épp első levelet küld, nem vágunk közbe.
      if (campaignState(accountId)?.current) continue;

      const cap = account.warmup
        ? warmupCap(
            account.warmupStart ?? first.get(accountId),
            account.provider,
            now,
            account.warmupSteps,
          )
        : account.dailyMax;
      const planned = used.get(accountId)?.get(today) ?? 0;
      if (roomToday(cap, planned, done?.count ?? 0) < 1) continue;

      // Akinél most munkaidő van — a címzett helyi ideje szerint.
      for (const doc of docs) {
        const contact = doc.contactId
          ? await getContactById(doc.contactId).catch(() => null)
          : null;
        if (
          !insideWindowAt(
            now,
            timeZoneFor(contact?.country),
            QUEUE_WINDOW_FROM,
            QUEUE_WINDOW_TO,
          )
        ) {
          continue;
        }
        if (await sendOne(doc)) result.sent += 1;
        // Fiókonként egy kör = legfeljebb egy próbálkozás.
        break;
      }
    }
    return result;
  } finally {
    flags.__melodiaReplyTicking = false;
  }
}

/**
 * A fiók legrégebben jóváhagyott queue-s válasza, ha a címzettnél munkaidő
 * van. Egy hívás legfeljebb egyet küld. Visszaadja a cég nevét, ha kiment.
 */
export async function sendQueuedReply(
  accountId: string,
  now = new Date(),
): Promise<string | null> {
  const docs = await (
    await replies()
  )
    .find({
      status: "jovahagyva",
      inQueue: true,
      accountId,
      queueDay: { $not: { $gt: dayKey(now) } },
    })
    .sort({ approvedAt: 1 })
    .limit(20)
    .toArray();
  for (const doc of docs) {
    const contact = doc.contactId
      ? await getContactById(doc.contactId).catch(() => null)
      : null;
    if (
      !insideWindowAt(
        now,
        timeZoneFor(contact?.country),
        QUEUE_WINDOW_FROM,
        QUEUE_WINDOW_TO,
      )
    ) {
      continue;
    }
    return (await sendOne(doc)) ? doc.company : null;
  }
  return null;
}

/** Szünet két queue-s válasz közt: a fiók cold queue-jának perc-tartománya. */
function laneGap(accountId: string): number {
  const state = campaignState(accountId);
  const min = (state?.minMinutes ?? 10) * 60_000;
  const max = Math.max(min, (state?.maxMinutes ?? 20) * 60_000);
  return Math.round(min + Math.random() * (max - min));
}

/**
 * A válasz-queue: fiókonként külön sáv, a cold queue mellett, a saját
 * ütemében. Ha lejárt a szünet, megy a következő; utána új véletlen szünet a
 * cold queue perc-tartományából. A napi keretbe nem számít. Csak a küldő gépen.
 */
export async function tickReplyQueue(now = new Date()): Promise<number> {
  if (!isSender() || flags.__melodiaLaneTicking) return 0;
  flags.__melodiaLaneTicking = true;
  try {
    const accountIds = (await (
      await replies()
    ).distinct("accountId", {
      status: "jovahagyva",
      inQueue: true,
      queueDay: { $not: { $gt: dayKey(now) } },
    })) as string[];
    const due = accountIds.filter(
      (id) => (laneNext.get(id) ?? 0) <= now.getTime(),
    );
    if (!due.length) return 0;
    if (!(await claimSender(now))) return 0;
    await ensureAccounts();
    let sent = 0;
    for (const accountId of due) {
      const company = await sendQueuedReply(accountId, now);
      if (!company) continue;
      sent += 1;
      const gap = laneGap(accountId);
      laneNext.set(accountId, now.getTime() + gap);
      log.info(
        `válasz-queue: ${company} kiment — a fiók következő válasza ${Math.round(gap / 60_000)} perc múlva, keret nélkül`,
      );
    }
    return sent;
  } finally {
    flags.__melodiaLaneTicking = false;
  }
}

/**
 * Soron kívüli válaszok: a jóváhagyottak azonnal, egymás után kimennek — a
 * cold queue-val párhuzamosan, a napi keret, a küldési ablak és a szünet
 * nélkül. Csak a küldő gépen.
 */
export async function sendPriority(now = new Date()): Promise<number> {
  if (!isSender() || flags.__melodiaPriorityTicking) return 0;
  flags.__melodiaPriorityTicking = true;
  try {
    const approved = await (
      await replies()
    )
      .find({ status: "jovahagyva", priority: true })
      .sort({ approvedAt: 1 })
      .toArray();
    if (!approved.length) return 0;
    if (!(await claimSender(now))) return 0;
    await ensureAccounts();
    let sent = 0;
    for (const doc of approved) {
      if (await sendOne(doc)) sent += 1;
    }
    if (sent) log.info(`soron kívüli válasz kiment: ${sent}`);
    return sent;
  } finally {
    flags.__melodiaPriorityTicking = false;
  }
}

/** Az időzített válaszok köre: 2 percenként, csak a küldő gépen. */
export function startThreadReplyRunner(): boolean {
  if (!isSender()) return false;
  if (flags.__melodiaReplyTimer) return true;
  if (isReplyLlmReady()) {
    void assertLlmReachable()
      .then(() => log.info("FreeLLMAPI elérhető — a piszkozatokat az írja"))
      .catch((error: Error) => log.warn(error.message));
  }
  flags.__melodiaPriorityTimer = setInterval(() => {
    void sendPriority().catch((error: Error) =>
      log.error("soron kívüli válaszok köre hibás", error.message),
    );
    void tickReplyQueue().catch((error: Error) =>
      log.error("válasz-queue köre hibás", error.message),
    );
  }, PRIORITY_TICK_MS);
  const run = () =>
    void tickThreadReplies()
      .then((result) => {
        if (result.drafted || result.sent) {
          log.info("időzített válaszok", {
            piszkozat: result.drafted,
            kiment: result.sent,
          });
        }
      })
      .catch((error: Error) =>
        log.error("időzített válaszok köre hibás", error.message),
      );
  flags.__melodiaReplyTimer = setInterval(run, TICK_MS);
  return true;
}

/**
 * A falu Válasz házának: egy fiók válaszai — ami jóváhagyásra vár, ami
 * jóváhagyva sorban áll, és ami ma kiment.
 */
export async function repliesToday(
  accountId: string,
  since: Date,
): Promise<{
  waiting: { company: string; status: ThreadReplyStatus }[];
  sent: { company: string; at: string }[];
  lastSentAt: string | null;
}> {
  const docs = await (
    await replies()
  )
    .find(
      {
        accountId,
        $or: [
          {
            status: { $in: ["generalas", "atnezendo", "jovahagyva", "kuldes"] },
          },
          { status: "kiment", sentAt: { $gte: since.toISOString() } },
        ],
      },
      { projection: { _id: 0, company: 1, status: 1, sentAt: 1 } },
    )
    .sort({ sentAt: -1, createdAt: 1 })
    .limit(200)
    .toArray();
  const sent = docs
    .filter((doc) => doc.status === "kiment" && doc.sentAt)
    .map((doc) => ({ company: doc.company, at: doc.sentAt as string }));
  return {
    waiting: docs
      .filter((doc) => doc.status !== "kiment")
      .map((doc) => ({ company: doc.company, status: doc.status })),
    sent,
    lastSentAt: sent[0]?.at ?? null,
  };
}

/** Egy szálra írt válasz, kiküldés nélkül — az automatikus Gmail-piszkozathoz. */
export interface ComposedReply {
  threadId: string;
  accountId: string;
  company: string;
  to: string;
  toName: string | null;
  subject: string;
  inReplyTo: string | null;
  repliedToAt: string;
  body: string;
  language: string | null;
}

/**
 * Megírja a választ a szál legutóbbi emberi levelére, ugyanazzal a modellel és
 * stílusmintákkal, mint a válasz-queue — de nem teszi be a queue-ba.
 */
export async function composeThreadReply(
  threadId: string,
): Promise<ComposedReply> {
  await ensureAccounts();
  const mail = (await latestIncoming([threadId])).get(threadId);
  if (!mail?.from) throw new Error("nincs a szálban emberi levél");
  if (isNoReply(mail.from)) throw new Error(`robotcímről jött (${mail.from})`);
  const account = listAccounts().find((item) =>
    mail.to.includes(item.user.toLowerCase()),
  );
  if (!account) throw new Error("nem találom a fiókot, amelyikre jött");
  const company = mail.company ?? mail.from;
  const draft = await compose({
    threadId,
    company,
    toName: mail.fromName,
  } as ThreadReply);
  return {
    threadId,
    accountId: account.id,
    company,
    to: mail.from,
    toName: mail.fromName,
    subject: replySubject(mail.subject),
    inReplyTo: mail.messageId,
    repliedToAt: mail.date,
    body: draft.body,
    language: draft.language,
  };
}

/** Van-e már a szálra válasz a queue-ban (akkor az automatikus piszkozat kimarad). */
export async function threadsInReplyQueue(
  threadIds: string[],
): Promise<Set<string>> {
  if (!threadIds.length) return new Set();
  const docs = await (
    await replies()
  )
    .find(
      { threadId: { $in: threadIds } },
      { projection: { _id: 0, threadId: 1 } },
    )
    .toArray();
  return new Set(docs.map((doc) => doc.threadId));
}
