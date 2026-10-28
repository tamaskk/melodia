/**
 * Automatikus válaszpiszkozatok: tíz percenként lekéri a leveleket, és minden
 * augusztus 1. óta érkezett, válaszra váró emberi levélre megír egy választ, a megfelelő
 * csatolmánnyal a fiók Gmail Piszkozatok mappájába. Semmit nem küld el — a
 * piszkozatot a Gmailben nézed át és küldöd.
 *
 * Csak a küldő gépen fut (egy gép írjon piszkozatot), Vercelen soha.
 */

import MailComposer from "nodemailer/lib/mail-composer";
import { getAccount } from "./accounts";
import { resolveSelection } from "./attachments";
import { replyAttachmentFor } from "./replyAttachments";
import {
  appendDraft,
  draftByMessageId,
  draftsPresent,
  isInboxReady,
  syncAndWait,
} from "./inbox";
import { createLogger } from "./logger";
import { listThreads } from "./mailStore";
import { getDb } from "./mongodb";
import { isSender } from "./role";
import { composeThreadReply, threadsInReplyQueue } from "./threadReplies";

const log = createLogger("autopiszkozat");

/** Átmeneti, nem a levéltől függő hiba (modell, hálózat, Gmail-belépés). */
const OUTAGE =
  /FreeLLMAPI|LLM_BASE_URL|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|fetch failed|Invalid credentials|AUTHENTICATIONFAILED/i;

const EVERY_MS = 10 * 60_000;
/** Egy lekérés legfeljebb ennyi levelet hoz — a többi a következő körre marad. */
const PER_RUN = 10;

export interface AutoDraft {
  threadId: string;
  /** A levél ideje, amire válaszolunk — egy szálra levelenként egy piszkozat. */
  repliedToAt: string;
  accountId: string;
  company: string;
  to: string;
  subject: string;
  language: string | null;
  attachment: string | null;
  /** A Gmail-piszkozat Message-ID-je — ezzel nyitható meg a Gmailben. */
  messageId?: string;
  /** A piszkozat szövege — a Levelezésben ebből küldhető el (régieknél a Gmailből töltődik). */
  body?: string;
  /** `iras`: épp ezen dolgozik egy gép. `elkuldve`: a Levelezésből kiment. */
  status: "iras" | "kesz" | "hiba" | "elkuldve";
  note: string | null;
  /** Melyik kör találta meg, és mikor lett kész. */
  runAt: string;
  draftedAt: string;
}

interface RunState {
  _id: "state";
  /** A legutóbbi kör kezdete, és fiókonként hány releváns levelet talált. */
  runAt: string;
  found: Record<string, number>;
  /** Leállítva: se lekérés, se piszkozatírás, amíg vissza nem kapcsolod. */
  paused?: boolean;
}

/** Le van-e állítva a Lekérő és a Válasz ház (az adatbázisból: újraindítás után is). */
async function isPaused(): Promise<boolean> {
  const state = await (
    await runState()
  ).findOne({ _id: "state" }, { projection: { paused: 1 } });
  return state?.paused === true;
}

/** Leállítás / újraindítás. Leállításkor a folyamatban lévő levél még elkészül. */
export async function setAutoDraftsPaused(paused: boolean): Promise<void> {
  await (
    await runState()
  ).updateOne(
    { _id: "state" },
    { $set: { paused }, $setOnInsert: { runAt: "", found: {} } },
    { upsert: true },
  );
  log.info(
    paused ? "lekérő és válasz ház leállítva" : "lekérő és válasz ház újra fut",
  );
  if (!paused) void writeQueue();
}

let ready: Promise<void> | null = null;

async function drafts() {
  const collection = (await getDb()).collection<AutoDraft>("auto_drafts");
  ready ??= Promise.all([
    collection.createIndex({ threadId: 1, repliedToAt: 1 }, { unique: true }),
    collection.createIndex({ draftedAt: -1 }),
  ]).then(() => undefined);
  await ready;
  return collection;
}

async function runState() {
  return (await getDb()).collection<RunState>("auto_draft_state");
}

function startOfToday(): Date {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return day;
}

/**
 * Ettől a naptól nézi a válaszra váró leveleket: az idei augusztus 1-jétől
 * (január–júliusban a tavalyitól). Körönként így is legfeljebb 10 megy.
 */
function fetchSince(now = new Date()): Date {
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 7, 1);
}

/** Egy levél RFC 822 alakban: a szálhoz fűzve, a csatolmánnyal. */
async function buildMessage(
  reply: Awaited<ReturnType<typeof composeThreadReply>>,
  from: { name: string; address: string },
  attachment: { filename: string; path: string } | null,
): Promise<{ raw: Buffer; messageId: string }> {
  const mail = new MailComposer({
    from,
    to: reply.toName ? { name: reply.toName, address: reply.to } : reply.to,
    subject: reply.subject,
    text: reply.body,
    inReplyTo: reply.inReplyTo ?? undefined,
    references: reply.inReplyTo ?? undefined,
    attachments: attachment ? [attachment] : [],
  }).compile();
  // A Message-ID-ből találja meg a Gmail a piszkozatot (a Raktár linkje).
  return { raw: await mail.build(), messageId: mail.messageId() };
}

/**
 * A Gmailből kitörölt, de el nem küldött piszkozatok visszakerülnek a sorba:
 * a bejegyzésük törlődik, így a következő lekérés újraírja őket. Csak azokat
 * nézzük, amelyek szála még válaszra vár — ami kiment, az már nem kell.
 */
async function releaseDeleted(
  collection: Awaited<ReturnType<typeof drafts>>,
  waiting: Set<string>,
): Promise<void> {
  const ready = (
    await collection
      .find(
        { status: "kesz", threadId: { $in: [...waiting] } },
        {
          projection: {
            _id: 1,
            accountId: 1,
            to: 1,
            subject: 1,
            messageId: 1,
            company: 1,
          },
        },
      )
      .toArray()
  ).filter((doc) => getAccount(doc.accountId)?.provider === "gmail");
  const byAccount = new Map<string, typeof ready>();
  for (const doc of ready) {
    byAccount.set(doc.accountId, [
      ...(byAccount.get(doc.accountId) ?? []),
      doc,
    ]);
  }
  for (const [accountId, docs] of byAccount) {
    const account = getAccount(accountId);
    if (!account) continue;
    try {
      const present = await draftsPresent(account, docs);
      const gone = docs.filter((_, index) => !present[index]);
      if (!gone.length) continue;
      await collection.deleteMany({ _id: { $in: gone.map((doc) => doc._id) } });
      log.info(
        `${gone.length} törölt piszkozat újra sorra kerül: ${gone
          .map((doc) => doc.company)
          .join(", ")}`,
      );
    } catch (error) {
      // Ha most nem érjük el a Gmailt, maradnak — a következő kör újra megnézi.
      log.warn(
        `${accountId}: a piszkozatok ellenőrzése kimaradt — ${(error as Error).message}`,
      );
    }
  }
}

type Found = { runAt: string; found: Record<string, number> };
type Thread = Awaited<ReturnType<typeof listThreads>>["threads"][number];

const work = globalThis as typeof globalThis & {
  /** Épp fut a lekérés (begyűjtés + válogatás) — ilyenkor nem indul másik. */
  __melodiaAutoFetching?: boolean;
  /** A megírásra váró levelek, sorban; a lekérések ide teszik, egy író viszi. */
  __melodiaDraftQueue?: { thread: Thread; runAt: string }[];
  __melodiaDraftWriting?: boolean;
};
const queue = (work.__melodiaDraftQueue ??= []);
const keyOf = (thread: Thread) => `${thread.threadId}|${thread.lastHumanIn}`;

/**
 * Lekérés: begyűjtés, a kitörölt piszkozatok elengedése, aztán az augusztus
 * 1. óta válaszra váró levelekből legfeljebb 10 új a megírandók sorába. Új az,
 * amire még nincs bejegyzés, és nincs is már a sorban — így egy kattintás akkor
 * is hoz levelet, ha az előző lekérés piszkozatai még íródnak.
 */
async function fetchBatch(): Promise<Found> {
  const runAt = new Date().toISOString();
  await syncAndWait();

  const since = fetchSince().toISOString();
  const { threads } = await listThreads({ status: "valasz-var" });
  const recent = threads.filter(
    (thread) => thread.lastHumanIn && thread.lastHumanIn >= since,
  );
  const collection = await drafts();
  // Ha a szerver írás közben leállt, a foglalás ott ragadt: tíz perc után elengedjük.
  await collection.deleteMany({
    status: "iras",
    draftedAt: { $lt: new Date(Date.now() - EVERY_MS).toISOString() },
  });
  await releaseDeleted(
    collection,
    new Set(threads.map((thread) => thread.threadId)),
  );
  const [done, inReplyQueue] = await Promise.all([
    collection
      .find(
        { threadId: { $in: recent.map((thread) => thread.threadId) } },
        { projection: { _id: 0, threadId: 1, repliedToAt: 1 } },
      )
      .toArray(),
    threadsInReplyQueue(recent.map((thread) => thread.threadId)),
  ]);
  const taken = new Set([
    ...done.map((doc) => `${doc.threadId}|${doc.repliedToAt}`),
    ...queue.map((item) => keyOf(item.thread)),
  ]);
  const todo = recent
    .filter(
      (thread) =>
        !inReplyQueue.has(thread.threadId) && !taken.has(keyOf(thread)),
    )
    .slice(0, PER_RUN);

  // A falu ebből tudja, hány levelet hozott a Lekérő ház ebben a körben.
  const found: Record<string, number> = {};
  for (const thread of todo) {
    const account = thread.account ?? "";
    found[account] = (found[account] ?? 0) + 1;
  }
  await (
    await runState()
  ).updateOne({ _id: "state" }, { $set: { runAt, found } }, { upsert: true });
  queue.push(...todo.map((thread) => ({ thread, runAt })));
  void writeQueue();
  return { runAt, found };
}

/** A sor megírása egyesével: piszkozat, mentés a Gmailbe, aztán a következő. */
async function writeQueue(): Promise<void> {
  if (work.__melodiaDraftWriting) return;
  work.__melodiaDraftWriting = true;
  try {
    let made = 0;
    for (let item = queue.shift(); item; item = queue.shift()) {
      // Leállítva: a levél a sorban marad, újraindításkor innen folytatja.
      if (await isPaused()) {
        queue.unshift(item);
        break;
      }
      try {
        if (await writeOne(item.thread, item.runAt)) made++;
      } catch (error) {
        // Leállás (modell, Gmail): a sor elejére vissza, és most abbahagyjuk.
        queue.unshift(item);
        log.warn(`a piszkozatírás leállt: ${(error as Error).message}`);
        break;
      }
    }
    if (made) log.info(`${made} új Gmail-piszkozat`);
  } finally {
    work.__melodiaDraftWriting = false;
  }
}

/**
 * Egy levél: foglalás, megírás, mentés a Gmailbe. Igaz, ha kész lett.
 * Átmeneti leállásnál (modell, Gmail) a foglalást elengedi és hibát dob.
 */
async function writeOne(thread: Thread, runAt: string): Promise<boolean> {
  const collection = await drafts();
  const base = {
    threadId: thread.threadId,
    repliedToAt: thread.lastHumanIn ?? runAt,
    company: thread.company ?? thread.counterpart,
    to: thread.counterpart,
    subject: thread.subject,
    runAt,
  };
  // Előbb lefoglaljuk a levelet: az egyedi index miatt ha egy másik gép már
  // dolgozik rajta, itt kimarad — így két gép sem ír rá kétszer piszkozatot.
  const claimed = await collection
    .insertOne({
      ...base,
      accountId: thread.account ?? "",
      language: null,
      attachment: null,
      status: "iras",
      note: null,
      draftedAt: new Date().toISOString(),
    })
    .then(() => true)
    .catch(() => false);
  if (!claimed) return false;
  const key = { threadId: base.threadId, repliedToAt: base.repliedToAt };
  try {
    const reply = await composeThreadReply(thread.threadId);
    const account = getAccount(reply.accountId);
    if (account?.provider !== "gmail") {
      throw new Error("a fiók nem Gmail — nincs Piszkozatok mappája");
    }
    // A nyelvhez a Beállításokban választott fájl; üresen csatolmány nélkül.
    const name = await replyAttachmentFor(reply.language);
    const { files } = name ? await resolveSelection([name]) : { files: [] };
    const file = files[0] ?? null;
    const { raw, messageId } = await buildMessage(
      reply,
      { name: account.fromName, address: account.user },
      file ? { filename: file.filename, path: file.path } : null,
    );
    await appendDraft(account, raw);
    await collection.updateOne(key, {
      $set: {
        accountId: account.id,
        company: reply.company,
        to: reply.to,
        subject: reply.subject,
        body: reply.body,
        language: reply.language,
        attachment: file ? name : null,
        status: "kesz",
        messageId,
        note: file || !name ? null : `nincs meg a csatolmány: ${name}`,
        draftedAt: new Date().toISOString(),
      },
    });
    log.info(
      `Gmail-piszkozat kész: ${reply.company} (${name ?? "csatolmány nélkül"})`,
    );
    return true;
  } catch (error) {
    const message = (error as Error).message;
    // Ha a modell vagy a Gmail nem érhető el, az nem a levél hibája.
    if (OUTAGE.test(message)) {
      await collection.deleteOne(key).catch(() => undefined);
      throw error;
    }
    log.warn(`piszkozat kimaradt: ${base.company} — ${message}`);
    // Hibát is rögzítünk, hogy a következő kör ne próbálja újra minden tíz percben.
    await collection
      .updateOne(key, {
        $set: {
          status: "hiba",
          note: message,
          draftedAt: new Date().toISOString(),
        },
      })
      .catch(() => undefined);
    return false;
  }
}

/**
 * Lekérés most (a tízperces ütem és a Lekérő házra kattintás is ezt hívja).
 * A lekérés végét várja meg; a piszkozatok a háttérben, egyesével készülnek.
 */
export async function triggerAutoDrafts(): Promise<Found> {
  // Csak piszkozatot ír, nem küld. A küldő gépen nem fut: ott nincs a helyi
  // LLM, a válaszokat a néző gép írja.
  if (process.env.VERCEL) {
    throw new Error("A telepített példányon nincs lekérés.");
  }
  if (isSender()) {
    throw new Error(
      "A küldő gépen nincs lekérés — a válaszokat a helyi LLM-es gép írja.",
    );
  }
  if (!isInboxReady()) throw new Error("Nincs Gmail-hozzáférés a lekéréshez.");
  if (await isPaused()) {
    throw new Error(
      "A Lekérő és a Válasz ház le van állítva — indítsd el a ▶ gombbal.",
    );
  }
  if (work.__melodiaAutoFetching) {
    throw new Error("Épp most kér le — pár másodperc múlva próbáld újra.");
  }
  work.__melodiaAutoFetching = true;
  try {
    return await fetchBatch();
  } catch (error) {
    log.error("lekérés hiba", (error as Error).message);
    throw error;
  } finally {
    work.__melodiaAutoFetching = false;
  }
}

/** A falunak: a legutóbbi kör, fiókonként a talált levelek, és a mai piszkozatok. */
export async function autoDraftsToday(): Promise<{
  runAt: string | null;
  found: Record<string, number>;
  paused: boolean;
  drafts: Omit<AutoDraft, "runAt">[];
}> {
  const [state, docs] = await Promise.all([
    (await runState()).findOne({ _id: "state" }),
    (await drafts())
      .find(
        { draftedAt: { $gte: startOfToday().toISOString() } },
        { projection: { _id: 0, runAt: 0 } },
      )
      .sort({ draftedAt: -1 })
      .limit(200)
      .toArray(),
  ]);
  return {
    runAt: state?.runAt || null,
    found: state?.found ?? {},
    paused: state?.paused === true,
    drafts: docs,
  };
}

/** A Levelezés „piszkozat” szűrőjéhez: a szálak, amelyekhez kész piszkozat vár. */
export async function draftThreadIds(): Promise<Set<string>> {
  const ids = await (await drafts()).distinct("threadId", { status: "kesz" });
  return new Set(ids.map(String));
}

/**
 * Egy szál kész piszkozata a szál alján lévő írónak. A szöveg nélküli (régi)
 * bejegyzéseknél a Gmailből olvassa ki, és elmenti. null, ha nincs, vagy a
 * Gmailből már kitörölték.
 */
export async function threadDraft(threadId: string): Promise<{
  subject: string;
  body: string;
  attachment: string | null;
} | null> {
  const collection = await drafts();
  const doc = await collection.findOne(
    { threadId, status: "kesz" },
    { sort: { draftedAt: -1 } },
  );
  if (!doc) return null;
  let body = doc.body ?? null;
  const account = getAccount(doc.accountId);
  if (body === null && doc.messageId && account) {
    body = await draftByMessageId(account, doc.messageId);
    if (body) {
      await collection.updateOne(
        { threadId, repliedToAt: doc.repliedToAt },
        { $set: { body } },
      );
    }
  }
  return body
    ? { subject: doc.subject, body, attachment: doc.attachment }
    : null;
}

/**
 * A Levelezésből elküldött piszkozat: `elkuldve` lesz (így nem kerül újra
 * sorra), és a Gmail-piszkozatot töröljük, hogy ne maradjon ott kétszer.
 */
export async function markDraftSent(threadId: string): Promise<void> {
  const collection = await drafts();
  const docs = await collection
    .find(
      { threadId, status: "kesz" },
      { projection: { repliedToAt: 1, accountId: 1, messageId: 1 } },
    )
    .toArray();
  for (const doc of docs) {
    await collection.updateOne(
      { threadId, repliedToAt: doc.repliedToAt },
      { $set: { status: "elkuldve", draftedAt: new Date().toISOString() } },
    );
    const account = getAccount(doc.accountId);
    if (!account || !doc.messageId) continue;
    await draftByMessageId(account, doc.messageId, true).catch((error) =>
      log.warn(
        `a Gmail-piszkozat törlése kimaradt — ${(error as Error).message}`,
      ),
    );
  }
}
