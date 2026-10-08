/**
 * Előre összeállított kiküldési sorok (queue-k).
 *
 * Egy queue rögzített címzettlista és a hozzá kötött küldő fiókok, fiókonkénti
 * napi kerettel. Indításkor minden bekötött fiók elindul, a címzetteket az
 * előrejelzés (`queuePlan.ts`) osztja szét köztük — egy cég csak egy fióktól
 * kap levelet.
 */
import { ObjectId, type Filter } from "mongodb";
import { ensureAccounts, getAccount, listAccounts } from "./accounts";
import type { MailProvider } from "./accountStore";
import { listContactIds } from "./contacts";
import { createLogger } from "./logger";
import { getContacts, getDb } from "./mongodb";
import {
  dayKey,
  dayKeys,
  isWeekend,
  planQueue,
  QUEUE_WINDOW_FROM,
  QUEUE_WINDOW_TO,
  throughputCap,
  type PlanAccount,
} from "./queuePlan";
import { campaignState, startCampaign, stopCampaign } from "./sendCampaign";
import type { Contact, ContactFilters } from "./types";

const log = createLogger("queue");

/**
 * Telepített (serverless) példány: itt queue nem indul és nem fut — a küldés
 * hosszan élő folyamatot kíván (lásd `sendCampaign.ts`). Ezt az őrfeltételt ne
 * vedd ki.
 */
const SERVERLESS = Boolean(process.env.VERCEL);

/** Ennyi címzett fér egy queue-ba — efölött a lista kezelhetetlenül lassú lenne. */
const MAX_CONTACTS = 5000;
/** A naptár: ennyi nap visszafelé és előre (a mai nappal együtt). */
const PAST_DAYS = 7;
const FUTURE_DAYS = 21;
/** Indításkor ennyi napra előre osztjuk szét a címzetteket. */
const SPLIT_HORIZON_DAYS = 365;

interface QueueAccount {
  accountId: string;
  dailyLimit: number;
}

/**
 * `varakozik` = az ütemező még nem vette fel · `fut` = betöltve, a küldés megy
 * (vagy a holnapra vár) · `kesz` = végigment · `leallitva` = kézzel vagy hiba
 * miatt megállt, és magától nem indul újra.
 */
export type QueueStatus = "varakozik" | "fut" | "kesz" | "leallitva";

interface QueueDoc {
  name: string;
  contactIds: string[];
  accounts: QueueAccount[];
  minMinutes: number;
  maxMinutes: number;
  /** Ettől a naptól indulhat (`ÉÉÉÉ-HH-NN`, a feladó naptára szerint). */
  runDate: string;
  status: QueueStatus;
  /** Mikor töltötte be az ütemező — egy queue csak egyszer töltődik be. */
  loadedAt?: string | null;
  /** Emberi mondat az állapot mellé (pl. miért állt meg). */
  note?: string | null;
  createdAt: string;
}

export interface QueueInfo {
  id: string;
  name: string;
  total: number;
  /** Akik még kaphatnak levelet: van címük, nem ment nekik, nincs kimenetel. */
  remaining: number;
  sent: number;
  minMinutes: number;
  maxMinutes: number;
  /** Ennyi levél fér egy napba a szünetek miatt, fiókonként. */
  perDayByTime: number;
  accounts: {
    accountId: string;
    label: string;
    provider: MailProvider | null;
    dailyLimit: number;
    /** A fiókot azóta törölték. */
    missing: boolean;
    /** Ez a fiók most ebből a queue-ból küld. */
    running: boolean;
    /** A fiók mással foglalt (másik queue vagy kézi indítás). */
    busy: boolean;
  }[];
  /** Várhatóan ezen a napon fogy el, ha fut; `null`, ha a naptáron túl. */
  finishDay: string | null;
  runDate: string;
  status: QueueStatus;
  loadedAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface CalendarRow {
  accountId: string;
  label: string;
  provider: MailProvider;
  /** A `days` sorrendjében: ténylegesen kiment és tervezett darab. */
  cells: { sent: number; planned: number }[];
}

export interface QueueOverview {
  queues: QueueInfo[];
  calendar: { days: string[]; today: string; rows: CalendarRow[] };
}

async function queues() {
  return (await getDb()).collection<QueueDoc>("send_queues");
}

function members(ids: string[]) {
  return {
    $in: ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)),
  };
}

/** Aki a queue-ból még levelet kaphat. */
function eligible(ids: string[]): Filter<Contact> {
  return {
    _id: members(ids),
    primaryEmail: { $ne: null },
    sent: false,
    outcome: null,
  } as Filter<Contact>;
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, Math.round(number)))
    : fallback;
};

export async function createQueue(input: {
  name?: unknown;
  ids?: unknown;
  filters?: ContactFilters;
  accounts?: unknown;
  minMinutes?: unknown;
  maxMinutes?: unknown;
  runDate?: unknown;
}): Promise<{
  id: string;
  total: number;
  /** Kihagyva, mert már egy másik queue-ban van — és melyikekben. */
  skipped: number;
  skippedIn: string[];
}> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new Error("Adj nevet a queue-nak.");

  const today = dayKey(new Date());
  const runDate =
    typeof input.runDate === "string" && input.runDate ? input.runDate : today;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(runDate) ||
    Number.isNaN(new Date(`${runDate}T12:00:00Z`).getTime())
  ) {
    throw new Error("A futás napja ÉÉÉÉ-HH-NN alakú dátum legyen.");
  }
  if (runDate < today) {
    throw new Error("A futás napja nem lehet a múltban.");
  }

  const accounts: QueueAccount[] = [];
  for (const item of Array.isArray(input.accounts) ? input.accounts : []) {
    const row = item as { accountId?: unknown; dailyLimit?: unknown };
    const account =
      typeof row.accountId === "string" ? getAccount(row.accountId) : null;
    if (!account || accounts.some((one) => one.accountId === account.id))
      continue;
    accounts.push({
      accountId: account.id,
      dailyLimit: clamp(row.dailyLimit, 1, 100, 40),
    });
  }
  if (!accounts.length) {
    throw new Error("Köss be legalább egy küldő fiókot.");
  }

  const picked = Array.isArray(input.ids)
    ? input.ids.filter(
        (id): id is string => typeof id === "string" && ObjectId.isValid(id),
      )
    : [];
  // Kijelölés nélkül a szűrt lista megy be — de rögzítve, az aktuális állapot szerint.
  const contactIds = picked.length
    ? [...new Set(picked)]
    : await listContactIds(
        {
          ...(input.filters ?? {}),
          hasEmail: "yes",
          sent: "no",
          outcome: "none",
          sort: "company",
        },
        MAX_CONTACTS,
      );
  if (!contactIds.length) {
    throw new Error(
      "Nincs kit betenni: a kijelölésben vagy a szűrt listában senkinek nincs címe, vagy már mindenki kapott levelet.",
    );
  }
  if (contactIds.length > MAX_CONTACTS) {
    throw new Error(
      `Egy queue-ba legfeljebb ${MAX_CONTACTS} címzett fér. Szűkítsd a kijelölést.`,
    );
  }

  // Egy cég egyszerre csak egy queue-ban lehet: különben mindkettő számolna
  // vele (a naptár kétszer tervezné), és az döntené el, ki küldi, hogy melyik
  // indul előbb.
  const overlaps = await (await queues())
    .aggregate<{ name: string; shared: string[] }>([
      { $match: { contactIds: { $in: contactIds } } },
      {
        $project: {
          name: 1,
          shared: { $setIntersection: ["$contactIds", contactIds] },
        },
      },
    ])
    .toArray();
  const taken = new Set(overlaps.flatMap((queue) => queue.shared));
  const skippedIn = overlaps.map((queue) => queue.name);
  const fresh = contactIds.filter((id) => !taken.has(id));
  if (!fresh.length) {
    throw new Error(
      `Mind a ${contactIds.length} cég már benne van egy másik queue-ban (${skippedIn.join(", ")}). Nincs mit menteni.`,
    );
  }

  const minMinutes = clamp(input.minMinutes, 1, 120, 10);
  const doc: QueueDoc = {
    name: name.slice(0, 80),
    contactIds: fresh,
    accounts,
    minMinutes,
    maxMinutes: Math.max(minMinutes, clamp(input.maxMinutes, 1, 240, 20)),
    runDate,
    status: "varakozik",
    loadedAt: null,
    note: null,
    createdAt: new Date().toISOString(),
  };
  const result = await (await queues()).insertOne(doc);
  log.info(`új queue: ${doc.name} — ${fresh.length} címzett`, {
    fiokok: accounts.map((account) => account.accountId),
    kihagyva: taken.size,
  });
  return {
    id: result.insertedId.toString(),
    total: fresh.length,
    skipped: taken.size,
    skippedIn,
  };
}

/** Csak név és méret — a kiküldő panel választójához. */
export async function listQueueNames(): Promise<
  { id: string; name: string; total: number }[]
> {
  const docs = await (await queues())
    .aggregate<{ _id: ObjectId; name: string; total: number }>([
      { $sort: { createdAt: 1 } },
      { $project: { name: 1, total: { $size: "$contactIds" } } },
    ])
    .toArray();
  return docs.map((doc) => ({
    id: doc._id.toString(),
    name: doc.name,
    total: doc.total,
  }));
}

interface CampaignRow {
  accountId: string;
  status: string;
  stopRequested?: boolean;
  options?: { queueId?: string };
}

async function campaignRows(filter: Record<string, unknown> = {}) {
  // A kiküldő menetek mentett állapota (`sendCampaign.ts`). Az adatbázisból
  // olvassuk, nem a memóriából: a telepített példány így is látja, mit csinál
  // a lokális szerver.
  return (await getDb())
    .collection<CampaignRow>("campaigns")
    .find(filter, {
      projection: {
        _id: 0,
        accountId: 1,
        status: 1,
        stopRequested: 1,
        "options.queueId": 1,
      },
    })
    .toArray();
}

/** Éppen küldő fiók → melyik queue-ból (`null` = kézi indítás). */
async function activeCampaigns(): Promise<Map<string, string | null>> {
  const rows = await campaignRows({
    status: { $in: ["running", "stopping"] },
    stopRequested: { $ne: true },
  });
  return new Map(
    rows.map((row) => [row.accountId, row.options?.queueId ?? null]),
  );
}

function runningFor(id: string, active: Map<string, string | null>): string[] {
  return [...active].filter(([, queueId]) => queueId === id).map(([a]) => a);
}

export async function deleteQueue(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const collection = await queues();
  const doc = await collection.findOne({ _id: new ObjectId(id) });
  if (!doc) return false;
  // Futó küldés ne maradjon gazdátlan queue-val.
  for (const accountId of runningFor(id, await activeCampaigns()))
    stopCampaign(accountId);
  await collection.deleteOne({ _id: new ObjectId(id) });
  log.warn(`queue törölve: ${doc.name}`);
  return true;
}

/** Fiókonként az első küldés ideje — a felfuttatás ettől számít. */
async function firstSends(): Promise<Map<string, string | null>> {
  // A kiküldő menetek mentett állapotából (`sendCampaign.ts`), csak ez az egy mező.
  const docs = await (
    await getDb()
  )
    .collection<{ accountId: string; firstSendAt?: string }>("campaigns")
    .find({}, { projection: { _id: 0, accountId: 1, firstSendAt: 1 } })
    .toArray();
  return new Map(docs.map((doc) => [doc.accountId, doc.firstSendAt ?? null]));
}

/** Naponta, fiókonként a ténylegesen kiment első levelek — a szerver számolja. */
async function sentByDay(
  since: string,
): Promise<Map<string, Map<string, number>>> {
  const rows = await (
    await getContacts()
  )
    .aggregate<{ _id: { day: string; from: string }; count: number }>([
      { $match: { sent: true, sentAt: { $gte: since } } },
      {
        $group: {
          _id: {
            day: {
              $dateToString: {
                date: { $toDate: "$sentAt" },
                format: "%Y-%m-%d",
                timezone: "Europe/Budapest",
              },
            },
            from: { $ifNull: ["$sentFrom", ""] },
          },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const out = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row._id.from) continue;
    if (!out.has(row._id.from)) out.set(row._id.from, new Map());
    out.get(row._id.from)!.set(row._id.day, row.count);
  }
  return out;
}

function planAccounts(
  doc: QueueDoc,
  first: Map<string, string | null>,
  only?: Set<string>,
): PlanAccount[] {
  const out: PlanAccount[] = [];
  for (const bound of doc.accounts) {
    const account = getAccount(bound.accountId);
    if (!account || (only && !only.has(account.id))) continue;
    out.push({
      id: account.id,
      provider: account.provider,
      dailyLimit: bound.dailyLimit,
      firstSendAt: first.get(account.id) ?? null,
    });
  }
  return out;
}

/** Minden queue állapota és a naptár — a `/queues` oldal ebből él. */
export async function queueOverview(): Promise<QueueOverview> {
  const now = new Date();
  const today = dayKey(now);
  const days = dayKeys(now, -PAST_DAYS, PAST_DAYS + FUTURE_DAYS);
  const future = days.filter((day) => day >= today);

  const collection = await getContacts();
  const [docs, first, active, sent] = await Promise.all([
    (await queues()).find({}).sort({ createdAt: 1 }).toArray(),
    firstSends(),
    activeCampaigns(),
    // Egy nap ráhagyás: a napok határa a feladó időzónájában van, nem UTC-ben.
    sentByDay(
      new Date(now.getTime() - (PAST_DAYS + 1) * 86_400_000).toISOString(),
    ),
  ]);

  const counts = await Promise.all(
    docs.map((doc) =>
      Promise.all([
        collection.countDocuments(eligible(doc.contactIds)),
        collection.countDocuments({
          _id: members(doc.contactIds),
          sent: true,
        } as Filter<Contact>),
      ]),
    ),
  );

  // A ma már kiment levelek a mai keretből fogynak.
  const used = new Map<string, Map<string, number>>();
  for (const [accountId, byDay] of sent) {
    const todays = byDay.get(today);
    if (todays) used.set(accountId, new Map([[today, todays]]));
  }

  const planned = new Map<string, Map<string, number>>();
  const infos: QueueInfo[] = docs.map((doc, index) => {
    const id = doc._id.toString();
    const [remaining, sentCount] = counts[index];
    // Csak ami tényleg menni fog: a leállított és a kész queue nem tervez,
    // a várakozó pedig a saját napjától.
    const live = doc.status === "varakozik" || doc.status === "fut";
    const plan = planQueue(
      {
        remaining: live ? remaining : 0,
        accounts: planAccounts(doc, first),
        minMinutes: doc.minMinutes,
        maxMinutes: doc.maxMinutes,
      },
      future.filter((day) => day >= doc.runDate),
      used,
    );
    for (const [accountId, byDay] of plan.cells) {
      if (!planned.has(accountId)) planned.set(accountId, new Map());
      for (const [day, count] of byDay) {
        const row = planned.get(accountId)!;
        row.set(day, (row.get(day) ?? 0) + count);
      }
    }

    const running = new Set(runningFor(id, active));
    return {
      id,
      name: doc.name,
      total: doc.contactIds.length,
      remaining,
      sent: sentCount,
      minMinutes: doc.minMinutes,
      maxMinutes: doc.maxMinutes,
      perDayByTime: throughputCap(doc.minMinutes, doc.maxMinutes),
      accounts: doc.accounts.map((bound) => {
        const account = getAccount(bound.accountId);
        return {
          accountId: bound.accountId,
          label: account?.label ?? bound.accountId,
          provider: account?.provider ?? null,
          dailyLimit: bound.dailyLimit,
          missing: !account,
          running: running.has(bound.accountId),
          busy:
            active.has(bound.accountId) && !running.has(bound.accountId),
        };
      }),
      finishDay: live && remaining ? plan.finishDay : null,
      runDate: doc.runDate,
      status: doc.status,
      loadedAt: doc.loadedAt ?? null,
      note: doc.note ?? null,
      createdAt: doc.createdAt,
    };
  });

  const rows: CalendarRow[] = listAccounts().map((account) => ({
    accountId: account.id,
    label: account.label,
    provider: account.provider,
    cells: days.map((day) => ({
      sent: sent.get(account.user)?.get(day) ?? 0,
      planned: isWeekend(day) ? 0 : (planned.get(account.id)?.get(day) ?? 0),
    })),
  }));

  return { queues: infos, calendar: { days, today, rows } };
}

const NOTHING_LEFT = "Ebben a queue-ban már nincs kinek küldeni.";

/**
 * A küldés tényleges elindítása: minden bekötött, éppen szabad fiók elindul a
 * saját részével. A menetek a napi keret elfogyásakor nem állnak le, hanem
 * másnap folytatják — így a queue magától végigmegy.
 */
async function launch(
  id: string,
  doc: QueueDoc,
): Promise<{ started: string[]; skipped: string[]; message: string }> {

  // A queue sorrendjét megtartva azok, akik még kaphatnak levelet.
  const open = new Set(
    (
      await (
        await getContacts()
      )
        .find(eligible(doc.contactIds), { projection: { _id: 1 } })
        .toArray()
    ).map((contact) => contact._id.toString()),
  );
  const ids = doc.contactIds.filter((contactId) => open.has(contactId));
  if (!ids.length) {
    throw new Error(NOTHING_LEFT);
  }

  const skipped: string[] = [];
  const free = new Set<string>();
  for (const bound of doc.accounts) {
    const state = campaignState(bound.accountId);
    if (!state) skipped.push(`${bound.accountId} (törölt fiók)`);
    else if (state.status === "running" || state.status === "stopping")
      skipped.push(`${state.accountLabel} (már küld)`);
    else free.add(bound.accountId);
  }
  if (!free.size) {
    throw new Error(
      `Egyik bekötött fiók sem szabad: ${skipped.join(", ")}. Állítsd le őket, vagy várd meg a végét.`,
    );
  }

  const now = new Date();
  const today = dayKey(now);
  const sent = await sentByDay(
    new Date(now.getTime() - 86_400_000).toISOString(),
  );
  const used = new Map<string, Map<string, number>>();
  for (const [accountId, byDay] of sent) {
    const todays = byDay.get(today);
    if (todays) used.set(accountId, new Map([[today, todays]]));
  }

  const accounts = planAccounts(doc, await firstSends(), free);
  const plan = planQueue(
    {
      remaining: ids.length,
      accounts,
      minMinutes: doc.minMinutes,
      maxMinutes: doc.maxMinutes,
    },
    dayKeys(now, 0, SPLIT_HORIZON_DAYS),
    used,
  );
  // Ami a vizsgált időbe sem fért bele, azt a legnagyobb keretű fiók viszi.
  if (plan.leftover) {
    const biggest = [...accounts].sort(
      (a, b) => b.dailyLimit - a.dailyLimit,
    )[0];
    plan.totals.set(
      biggest.id,
      (plan.totals.get(biggest.id) ?? 0) + plan.leftover,
    );
  }

  const started: string[] = [];
  let offset = 0;
  for (const account of accounts) {
    const share = plan.totals.get(account.id) ?? 0;
    if (!share) continue;
    const result = await startCampaign({
      accountId: account.id,
      ids: ids.slice(offset, offset + share),
      dailyLimit: account.dailyLimit,
      minMinutes: doc.minMinutes,
      maxMinutes: doc.maxMinutes,
      windowFrom: QUEUE_WINDOW_FROM,
      windowTo: QUEUE_WINDOW_TO,
      ignoreWindow: false,
      mode: "initial",
      queueId: id,
      keepAlive: true,
    });
    offset += share;
    if ("error" in result) throw new Error(result.error);
    started.push(`${result.accountLabel}: ${share}`);
  }

  log.info(`queue indul: ${doc.name} — ${started.join(", ")}`);
  return {
    started,
    skipped,
    message:
      `Elindult: ${started.join(", ")} címzett.` +
      (skipped.length ? ` Kimaradt: ${skipped.join(", ")}.` : ""),
  };
}

/**
 * A queue lefoglalása betöltésre — atomi lépés, ezért két egyszerre futó
 * ellenőrzés közül csak az egyik kapja meg. Aki megkapta, az indít.
 */
async function claim(
  id: string,
  from: QueueStatus[],
): Promise<(QueueDoc & { previous: QueueStatus }) | null> {
  const before = await (await queues()).findOneAndUpdate(
    { _id: new ObjectId(id), status: { $in: from } },
    {
      $set: { status: "fut", loadedAt: new Date().toISOString(), note: null },
    },
    { returnDocument: "before" },
  );
  return before ? { ...before, previous: before.status } : null;
}

async function setStatus(
  id: string,
  status: QueueStatus,
  note: string | null,
): Promise<void> {
  await (await queues()).updateOne(
    { _id: new ObjectId(id) },
    { $set: { status, note } },
  );
}

/** Betöltés és indítás; hiba esetén a queue visszakerül oda, ahonnan jött. */
async function load(
  id: string,
  from: QueueStatus[],
): Promise<{ started: string[]; skipped: string[]; message: string } | null> {
  const doc = await claim(id, from);
  if (!doc) return null;
  try {
    return await launch(id, doc);
  } catch (error) {
    const message = (error as Error).message;
    if (message === NOTHING_LEFT) await setStatus(id, "kesz", null);
    else await setStatus(id, doc.previous, message);
    throw error;
  }
}

/** Kézi indítás — csak a lokális szerveren; a telepített példány nem küld. */
export async function startQueue(
  id: string,
): Promise<{ started: string[]; skipped: string[]; message: string }> {
  if (SERVERLESS) {
    throw new Error(
      "A telepített példány nem küld levelet. Hagyd a queue-t várakozó állapotban: " +
        "a lokális szerver 7 és 19 óra között magától elindítja.",
    );
  }
  if (!ObjectId.isValid(id)) throw new Error("Nincs ilyen queue.");
  const result = await load(id, ["varakozik", "leallitva"]);
  if (!result) {
    throw new Error("Ez a queue már fut vagy kész — nem indítható újra.");
  }
  return result;
}

/** Leállítás bárhonnan: a jelzés az adatbázisba megy, a küldő szerver ott látja. */
export async function stopQueue(id: string): Promise<{ stopped: number }> {
  if (!ObjectId.isValid(id)) throw new Error("Nincs ilyen queue.");
  const doc = await (await queues()).findOne({ _id: new ObjectId(id) });
  if (!doc) throw new Error("Nincs ilyen queue.");
  const running = runningFor(id, await activeCampaigns());
  for (const accountId of running) stopCampaign(accountId);
  if (doc.status !== "kesz") {
    await setStatus(id, "leallitva", "Kézzel leállítva.");
  }
  return { stopped: running.length };
}

/** Leállított queue vissza a sorba — az ütemező a következő körben felveszi. */
export async function requeueQueue(id: string): Promise<void> {
  if (!ObjectId.isValid(id)) throw new Error("Nincs ilyen queue.");
  const result = await (await queues()).updateOne(
    { _id: new ObjectId(id), status: "leallitva" },
    { $set: { status: "varakozik", note: null, loadedAt: null } },
  );
  if (!result.matchedCount) {
    throw new Error("Csak leállított queue tehető vissza a sorba.");
  }
}

/* ------------------------------------------------------------------ */
/* Ütemező: csak a lokális (nem telepített) szerveren                    */
/* ------------------------------------------------------------------ */

/** Ebben az órasávban (a feladó ideje szerint) indulhat queue. */
const START_FROM_HOUR = 7;
const START_UNTIL_HOUR = 19;
const TICK_MS = 10 * 60_000;

function senderHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Budapest",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
}

export interface TickResult {
  /** Hamis, ha az ellenőrzés nem futott le (telepített példány vagy éjszaka). */
  ran: boolean;
  reason: string | null;
  started: string[];
  finished: string[];
  errors: string[];
}

/**
 * Egy ellenőrző kör: az esedékes, várakozó queue-k betöltése és indítása.
 *
 * Telepített (serverless) példányon és 19–7 óra között nem csinál semmit. Egy
 * queue csak egyszer töltődik be: a betöltés pillanatában `fut` állapotba
 * kerül, és onnan az ütemező többé nem nyúl hozzá — csak lezárja, ha végzett.
 */
export async function tickQueues(now = new Date()): Promise<TickResult> {
  const idle = (reason: string): TickResult => ({
    ran: false,
    reason,
    started: [],
    finished: [],
    errors: [],
  });
  if (SERVERLESS) {
    return idle("Telepített példány — queue csak a lokális szerveren fut.");
  }
  const hour = senderHour(now);
  if (hour < START_FROM_HOUR || hour >= START_UNTIL_HOUR) {
    return idle(
      `${START_UNTIL_HOUR} és ${START_FROM_HOUR} óra között nem indul queue.`,
    );
  }

  await ensureAccounts();
  const collection = await queues();
  const result: TickResult = {
    ran: true,
    reason: null,
    started: [],
    finished: [],
    errors: [],
  };

  // 1. Lezárás: ami `fut`, de már egy fiók sem küld belőle.
  const active = await activeCampaigns();
  for (const doc of await collection.find({ status: "fut" }).toArray()) {
    const id = doc._id.toString();
    if (runningFor(id, active).length) continue;
    const [remaining, failed] = await Promise.all([
      (await getContacts()).countDocuments(eligible(doc.contactIds)),
      campaignRows({ "options.queueId": id, status: "error" }),
    ]);
    if (failed.length) {
      await setStatus(
        id,
        "leallitva",
        "A küldés hibával megállt — nézd meg a fiók üzenetét a kiküldő panelen.",
      );
      result.errors.push(`${doc.name}: a küldés hibával megállt`);
    } else {
      await setStatus(
        id,
        "kesz",
        remaining
          ? `${remaining} cég kimaradt (hiányos levél, vagy a cég már kapott levelet máshonnan).`
          : null,
      );
      result.finished.push(doc.name);
    }
  }

  // 2. Betöltés: a mai napra (vagy korábbra) szóló várakozók, sorban.
  const due = await collection
    .find(
      { status: "varakozik", runDate: { $lte: dayKey(now) } },
      { projection: { name: 1 } },
    )
    .sort({ runDate: 1, createdAt: 1 })
    .toArray();
  for (const doc of due) {
    try {
      const loaded = await load(doc._id.toString(), ["varakozik"]);
      if (loaded) result.started.push(`${doc.name} (${loaded.started.join(", ")})`);
    } catch (error) {
      const message = (error as Error).message;
      if (message === NOTHING_LEFT) result.finished.push(doc.name);
      else result.errors.push(`${doc.name}: ${message}`);
    }
  }
  return result;
}

const timers = globalThis as typeof globalThis & {
  __melodiaQueueTimer?: ReturnType<typeof setInterval>;
  __melodiaQueueTicking?: boolean;
};

/**
 * Az ütemező elindítása: 10 percenként egy ellenőrző kör. A szerver indulásakor
 * hívjuk egyszer. Telepített példányon el sem indul.
 */
export function startQueueRunner(): boolean {
  if (SERVERLESS) return false;
  if (timers.__melodiaQueueTimer) return true;

  const run = () => {
    // Egy lassú kör ne érje utol a következőt.
    if (timers.__melodiaQueueTicking) return;
    timers.__melodiaQueueTicking = true;
    void tickQueues()
      .then((result) => {
        if (result.started.length || result.finished.length || result.errors.length) {
          log.info("queue-ellenőrzés", {
            indult: result.started,
            kesz: result.finished,
            hiba: result.errors,
          });
        } else {
          log.debug(`queue-ellenőrzés: ${result.reason ?? "nincs teendő"}`);
        }
      })
      .catch((error: Error) => log.error("queue-ellenőrzés hiba", error.message))
      .finally(() => {
        timers.__melodiaQueueTicking = false;
      });
  };

  // Az első kör egy perccel indulás után: addigra a félbehagyott menetek folytatódnak.
  setTimeout(run, 60_000);
  timers.__melodiaQueueTimer = setInterval(run, TICK_MS);
  return true;
}
