/**
 * Ütemezett kiküldés: egyesével, emberi ritmusban — fiókonként külön.
 *
 * Minden Gmail-fióknak saját menete van: saját sor, saját napi keret, saját
 * ütemezés. Több fiók futhat egyszerre, egymást nem zavarják (egy címzettet
 * csak az egyikük kap meg).
 *
 * A menet a szerver folyamatában él, a kérés lezárása után is megy tovább — az
 * oldal frissítése nem szakítja meg. Az állapot az adatbázisba is bekerül, így
 * egy szerver-újraindulás után magától folytatódik (lásd `src/instrumentation.ts`).
 *
 * Szándékosan lassú és kicsi: napi 15-20 személyre szabott levél belefér a
 * normális Gmail-használatba. A gépies, percre pontos ritmus és a napi 200+
 * levél az, amitől egy személyes fiók zárolást kap.
 */
import { getAccount, listAccounts, type MailAccount } from "./accounts";
import { credential } from "./env";
import {
  countContacts,
  getContactById,
  listContactIds,
  updateContact,
} from "./contacts";
import { listAttachments, resolveSelection } from "./attachments";
import { createLogger } from "./logger";
import {
  isMailerReady,
  mailerConfig,
  sendContactEmail,
  sendFollowUpEmail,
} from "./mailer";
import { ObjectId } from "mongodb";
import { getContacts, getDb } from "./mongodb";
import { followUpDraft, isFollowUpDue } from "./followup";
import { firstOutgoingFrom, originalOutgoing } from "./mailStore";
import { QUEUE_WINDOW_FROM, QUEUE_WINDOW_TO } from "./queuePlan";
import { warmupCap, warmupLabel } from "./warmup";
import {
  alreadyContacted,
  bouncedDomains,
  contactedIndex,
  countriesFor,
  preflightRows,
  dedupeRecipients,
  markSiblingsSent,
  recipientsFor,
  type SkipReason,
} from "./recipients";
import { COUNTRIES } from "./countries";
import {
  localLabel,
  pickRecipient,
  TEST_MODE_LIMIT,
  timeZoneFor,
} from "./sendWindow";
import {
  hasBlocking,
  issuesFor,
  summarize,
  type PreflightSummary,
} from "./preflight";
import type { ContactDoc, ContactFilters } from "./types";

const log = createLogger("kuldes");

/**
 * Serverless környezet (Vercel): a függvény a válasz után leáll, és minden
 * kérés új példányban futhat. Egy órákig tartó, percenkénti szüneteket tartó
 * menet itt nem működik — sőt, több példány ugyanazt a sort folytatná, ami
 * dupla küldést okozhat. Ezért ott nem indítunk és nem folytatunk kampányt.
 */
const SERVERLESS = Boolean(process.env.VERCEL);

const SERVERLESS_MESSAGE =
  "Ez a példány Vercelen (serverless) fut, ahol a háttérben futó, órákon át " +
  "tartó kiküldés nem lehetséges: a függvény a válasz után leáll. A küldést " +
  "futtasd a gépedről (npm run dev) — ugyanez a kód, ugyanaz az adatbázis.";

export interface SentItem {
  company: string;
  email: string;
  at: string;
  /** Mi ment vele — utólag is látod, ki mit kapott. */
  attachments?: string[];
  /** Follow-up volt (nem első levél). */
  followUp?: boolean;
  error?: string;
}

export interface CampaignState {
  /** Melyik fiók menete ez. */
  accountId: string;
  accountUser: string;
  accountLabel: string;
  status: "idle" | "running" | "stopping" | "done" | "error";
  /** Ma hány levél ment ki ebből a fiókból (a keret ehhez képest fogy). */
  sentToday: number;
  dailyLimit: number;
  /** Az aktuális menetben feldolgozott / hibás darab. */
  processed: number;
  failed: number;
  /** Hány címzett vár még sorára ennél a fióknál. */
  remaining: number;
  current: string | null;
  /** Mikor megy a következő levél. */
  nextAt: string | null;
  startedAt: string | null;
  message: string | null;
  windowFrom: number;
  windowTo: number;
  /** Figyelmen kívül hagyja-e a munkaidő-ablakot (éjjel, hétvégén is küld). */
  ignoreWindow: boolean;
  /** Teszt mód: ablak nélkül, de indításonként legfeljebb pár levél. */
  testMode: boolean;
  /** A kiválasztott csatolmányok kulcsai. (A fájllistát a GET külön adja.) */
  selectedAttachments: string[];
  minMinutes: number;
  maxMinutes: number;
  recent: SentItem[];
  /** A sor építésekor kihagyott címzettek: már kapott levelet erre a címre / cégre. */
  skipped?: SkipCounts;
  /** Felfuttatási napi plafon (warmup.ts), vagy `null`, ha a fiók túl van rajta. */
  warmupCap?: number | null;
  /** A fiók saját napi maximuma (kikapcsolt felfuttatásnál), vagy `null`. */
  accountMax?: number | null;
  /** A queue, amelyből a mostani (vagy legutóbbi) menet indult. */
  queueId?: string | null;
}

export interface SkipCounts {
  sameEmail: number;
  sameDomain: number;
  /** A sorban ugyanaz a cím vagy cég kétszer (két forrásból importált sor). */
  inQueue: number;
}

export interface CampaignOptions {
  /** Melyik fiókból menjen. Üresen az első fiók. */
  accountId?: string;
  /** Konkrét sorok; ha üres, a szűrt halmazból dolgozunk. */
  ids?: string[];
  filters?: ContactFilters;
  /** Napi maximum (alap 18). */
  dailyLimit: number;
  /** Szünet két levél között, percben — véletlen érték a kettő közt. */
  minMinutes: number;
  maxMinutes: number;
  /** Munkaidő-ablak órában, a CÍMZETT helyi ideje szerint (sendWindow.ts). */
  windowFrom: number;
  windowTo: number;
  /**
   * Igaz: a munkaidő-ablakot figyelmen kívül hagyja — éjjel és hétvégén is
   * küld, korlát nélkül. Megerősítést kér a felületen.
   */
  ignoreWindow: boolean;
  /**
   * Teszt mód: szintén ablak nélkül, de indításonként legfeljebb
   * `TEST_MODE_LIMIT` levél. Kipróbáláshoz, nem éles kampányhoz.
   */
  testMode?: boolean;
  /** Kiválasztott csatolmányok (`CV.pdf`, `en/Letter.pdf`). Üres = mind. */
  attachments?: string[];
  /**
   * Igaz: egy cégdomainre több levél is mehet (fiókirodák külön címmel).
   * Alapból domainenként egy — ugyanaz a cégcím sosem kap kettőt.
   */
  allowSameDomain?: boolean;
  /**
   * `followup`: nem első levél, hanem a jóváhagyott follow-upok — ugyanabban a
   * szálban, csatolmány nélkül, csak az eredeti levél fiókjából.
   */
  mode?: "initial" | "followup";
  /** Csatolmány helyett CV-link (a `CV_URL` beállításból). */
  cvLink?: boolean;
  /** Melyik queue-ból indult (`sendQueues.ts`). */
  queueId?: string;
}

const SKIP_LABEL: Record<SkipReason, string> = {
  "same-email": "erre a címre már ment levél",
  "same-domain": "erre a cégdomainre már ment levél",
  "in-queue": "ugyanez a cím vagy cég a sorban korábban már szerepel",
};

function countSkips(reasons: SkipReason[]): SkipCounts {
  return {
    sameEmail: reasons.filter((reason) => reason === "same-email").length,
    sameDomain: reasons.filter((reason) => reason === "same-domain").length,
    inQueue: reasons.filter((reason) => reason === "in-queue").length,
  };
}

function skipSummary(counts: SkipCounts): string | null {
  const parts = [
    counts.sameEmail ? `${counts.sameEmail} címre már ment levél` : null,
    counts.sameDomain
      ? `${counts.sameDomain} cégdomainre már ment levél`
      : null,
    counts.inQueue ? `${counts.inQueue} ismétlődés a sorban` : null,
  ].filter(Boolean);
  return parts.length ? `Kihagyva: ${parts.join(", ")}.` : null;
}

interface Runner {
  account: MailAccount;
  state: CampaignState;
  options: CampaignOptions;
  /** Akik még hátra vannak. Mentjük, hogy újraindulás után folytatható legyen. */
  queue: string[];
  stopRequested: boolean;
  /** Címzett → ország, a helyi munkaidőhöz. Nem mentjük: a sorból újraépül. */
  countries: Map<string, string>;
  /** A fiók első küldése (felfuttatás kezdete); `undefined` = még nem töltöttük be. */
  firstSendAt: string | null | undefined;
  /** Follow-up módban: az eredeti levél azonosítója és tárgya címzettenként. */
  followUpRefs: Map<string, { messageId: string | null; subject: string }>;
  /** Megszakítható várakozás ébresztője. */
  wake: (() => void) | null;
  dayStamp: string;
  running: boolean;
}

/**
 * A futó menetek a `globalThis`-en élnek, nem modulváltozóban. A Next az
 * instrumentationt és a route-okat külön modulpéldányba töltheti, fejlesztés
 * közben pedig a HMR újraértékeli a modult: modulváltozóval két térkép lett, a
 * Leállítás az üreset látta ("idle"), a másikban futó menet pedig küldött tovább.
 */
const shared = globalThis as typeof globalThis & {
  __melodiaRunners?: Map<string, Runner>;
  __melodiaClaimed?: Map<string, string>;
};
const runners = (shared.__melodiaRunners ??= new Map<string, Runner>());

/**
 * Kiosztott címzettek: egy céget csak egy fiók keres meg. A `sent` mező is véd,
 * de két párhuzamos menet ugyanabból a sorból indulna — ez tartja szét őket.
 */
const claimed = (shared.__melodiaClaimed ??= new Map<string, string>());

function emptyState(account: MailAccount): CampaignState {
  return {
    accountId: account.id,
    accountUser: account.user,
    accountLabel: account.label,
    status: "idle",
    sentToday: 0,
    dailyLimit: 18,
    processed: 0,
    failed: 0,
    remaining: 0,
    current: null,
    nextAt: null,
    startedAt: null,
    message: null,
    windowFrom: 9,
    windowTo: 17,
    ignoreWindow: false,
    testMode: false,
    selectedAttachments: [],
    minMinutes: 10,
    maxMinutes: 20,
    recent: [],
  };
}

function runnerFor(account: MailAccount): Runner {
  const existing = runners.get(account.id);
  if (existing) {
    // A címke/név az env-ből bármikor változhat.
    existing.account = account;
    existing.state.accountLabel = account.label;
    existing.state.accountUser = account.user;
    return existing;
  }
  const runner: Runner = {
    account,
    state: emptyState(account),
    options: {
      dailyLimit: 18,
      minMinutes: 10,
      maxMinutes: 20,
      windowFrom: 9,
      windowTo: 17,
      ignoreWindow: false,
    },
    queue: [],
    countries: new Map(),
    firstSendAt: undefined,
    followUpRefs: new Map(),
    stopRequested: false,
    wake: null,
    dayStamp: new Date().toDateString(),
    running: false,
  };
  runners.set(account.id, runner);
  return runner;
}

/** Éjfél után a napi keret újraindul. */
function resetDailyCounterIfNeeded(runner: Runner): void {
  const today = new Date().toDateString();
  if (today !== runner.dayStamp) {
    runner.dayStamp = today;
    runner.state.sentToday = 0;
    log.info(`új nap — ${runner.account.user} napi kerete nullázva`);
  }
}

/** Egy fiók állapota. */
export function campaignState(accountId?: string | null): CampaignState | null {
  const account = getAccount(accountId);
  if (!account) return null;
  const runner = runnerFor(account);
  resetDailyCounterIfNeeded(runner);
  refreshCap(runner);
  return { ...runner.state, recent: [...runner.state.recent] };
}

/** A felfuttatás a beállításokban bármikor ki-be kapcsolható — kövesse az állapot. */
function refreshCap(runner: Runner): void {
  if (runner.firstSendAt !== undefined) runner.state.warmupCap = capOf(runner);
  runner.state.accountMax = maxOf(runner);
}

/** Minden fiók állapota — ebből látszik, melyik fut és hol tart. */
export function allCampaignStates(): CampaignState[] {
  return listAccounts().map((account) => {
    const runner = runnerFor(account);
    resetDailyCounterIfNeeded(runner);
    // A felfuttatási plafon betöltése a háttérben — a következő lekérdezés mutatja.
    if (runner.firstSendAt === undefined)
      void ensureFirstSend(runner).catch(() => undefined);
    refreshCap(runner);
    return { ...runner.state, recent: [...runner.state.recent] };
  });
}

export function stopCampaign(accountId?: string | null): CampaignState | null {
  const account = getAccount(accountId);
  if (!account) return null;
  const runner = runnerFor(account);

  // Az adatbázisba mindig beírjuk — ez a döntő jelzés. Ha a futó menet egy
  // másik modulpéldányban vagy folyamatban él, a következő levél előtt ezt látja.
  void requestStopInDb(account.id);

  if (runner.state.status === "running" || runner.state.status === "stopping") {
    runner.stopRequested = true;
    runner.state.status = "stopping";
    runner.state.message = runner.state.current
      ? "Leállítás kérve — a folyamatban lévő levél még kimegy."
      : "Leállítás…";
    log.warn(`leállítás kérve: ${account.user}`);
    // Ha épp várakozunk (szünet vagy munkaidőn kívül), azonnal ébresztünk.
    runner.wake?.();
    void persist(runner);
  }
  return campaignState(account.id);
}

async function requestStopInDb(accountId: string): Promise<void> {
  try {
    const collection = await campaigns();
    await collection.updateOne(
      { accountId },
      {
        $set: {
          stopRequested: true,
          status: "idle",
          nextAt: null,
          updatedAt: new Date().toISOString(),
        },
      },
    );
  } catch (error) {
    log.error(
      `leállítás mentése nem sikerült: ${accountId}`,
      (error as Error).message,
    );
  }
}

/**
 * Kérte-e valaki a leállítást az adatbázisban. Minden levél előtt megnézzük:
 * ha nem érjük el az adatbázist, inkább nem küldünk.
 */
async function stopRequestedInDb(accountId: string): Promise<boolean> {
  try {
    const collection = await campaigns();
    const doc = await collection.findOne(
      { accountId },
      { projection: { stopRequested: 1 } },
    );
    return doc?.stopRequested === true;
  } catch (error) {
    log.warn(
      `leállítás-ellenőrzés sikertelen, nem küldök: ${(error as Error).message}`,
    );
    return true;
  }
}

/** Minden futó menet leállítása (pl. karbantartás előtt). */
export function stopAllCampaigns(): CampaignState[] {
  for (const account of listAccounts()) stopCampaign(account.id);
  return allCampaignStates();
}

/**
 * Megszakítható várakozás. A küldések közti szünet és a munkaidő-ablakra való
 * várakozás is percekig tart — a `Leállítás` nem várhatja meg a végét.
 */
function sleep(runner: Runner, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      runner.wake = null;
      resolve();
    }, ms);
    runner.wake = () => {
      clearTimeout(timer);
      runner.wake = null;
      resolve();
    };
  });
}

/** Véletlen szünet a megadott perc-tartományban, másodperc-szórással. */
function pause(options: CampaignOptions): number {
  const min = options.minMinutes * 60_000;
  const max = Math.max(min, options.maxMinutes * 60_000);
  return Math.round(min + Math.random() * (max - min));
}

/**
 * A sorból azt veszi előre, akinél a SAJÁT helyi idejében épp munkaidő van.
 * Ha senkinél, `null` + hogy mikor nyílik a legkorábbi ablak (és hol).
 */
async function pickInsideWindow(
  runner: Runner,
): Promise<{ id: string } | { waitUntil: Date; country: string }> {
  const { options } = runner;
  const missing = runner.queue.filter((id) => !runner.countries.has(id));
  if (missing.length) {
    for (const [id, country] of await countriesFor(missing)) {
      runner.countries.set(id, country);
    }
  }

  const pick = pickRecipient(
    runner.queue,
    (id) => runner.countries.get(id),
    new Date(),
    options.windowFrom,
    options.windowTo,
  );
  return "index" in pick ? { id: runner.queue[pick.index] } : pick;
}

/* ------------------------------------------------------------------ */
/* Mentés: a menet túléli a szerver újraindítását                       */
/* ------------------------------------------------------------------ */

interface CampaignDoc {
  accountId: string;
  status: CampaignState["status"];
  options: CampaignOptions;
  queue: string[];
  sentToday: number;
  dayStamp: string;
  processed: number;
  failed: number;
  startedAt: string | null;
  message: string | null;
  recent: SentItem[];
  updatedAt: string;
  /** Mikor mehet a következő levél. A tick ebből tudja, hogy még várni kell. */
  nextAt?: string | null;
  /** A fiók első sikeres küldése — a felfuttatás (warm-up) ettől számít. */
  firstSendAt?: string;
  /**
   * Leállítás kérve. Csak a Leállítás írja `true`-ra, és csak az indítás
   * nullázza — a `persist()` nem nyúl hozzá, így egy futó menet nem írhatja
   * vissza "running"-ra.
   */
  stopRequested?: boolean;
}

async function campaigns() {
  const db = await getDb();
  return db.collection<CampaignDoc>("campaigns");
}

async function persist(runner: Runner): Promise<void> {
  try {
    const collection = await campaigns();
    // Leállítás után egy lemaradt menet ne élessze fel az állapotot.
    const status =
      (runner.state.status === "running" ||
        runner.state.status === "stopping") &&
      (await stopRequestedInDb(runner.account.id))
        ? "idle"
        : runner.state.status;
    await collection.updateOne(
      { accountId: runner.account.id },
      {
        $set: {
          accountId: runner.account.id,
          status,
          options: runner.options,
          queue: runner.queue,
          sentToday: runner.state.sentToday,
          dayStamp: runner.dayStamp,
          processed: runner.state.processed,
          failed: runner.state.failed,
          startedAt: runner.state.startedAt,
          message: runner.state.message,
          recent: runner.state.recent.slice(0, 20),
          nextAt: runner.state.nextAt,
          ...(runner.firstSendAt ? { firstSendAt: runner.firstSendAt } : {}),
          updatedAt: new Date().toISOString(),
        } satisfies CampaignDoc,
      },
      { upsert: true },
    );
  } catch (error) {
    // A mentés kiesése nem állíthatja meg a küldést.
    log.warn(`állapot mentése nem sikerült: ${(error as Error).message}`);
  }
}

/**
 * Újraindulás utáni folytatás. A szerver indulásakor fut le egyszer: minden
 * fiókot, amelyik futó állapotban maradt, ott vesz fel, ahol abbamaradt.
 */
export async function resumeCampaigns(): Promise<number> {
  if (SERVERLESS) {
    log.info(
      "serverless környezet — a félbehagyott menetek itt nem folytatódnak",
    );
    return 0;
  }
  if (!isMailerReady()) return 0;

  let resumed = 0;
  try {
    const collection = await campaigns();
    const docs = await collection
      .find({
        status: { $in: ["running", "stopping"] },
        stopRequested: { $ne: true },
      })
      .toArray();

    for (const doc of docs) {
      const account = getAccount(doc.accountId);
      if (!account) continue;

      const runner = runnerFor(account);
      if (runner.running) continue;

      // A queue-ból indult menet a mostani queue-ablakkal folytat — így az
      // ablak átállítása a már futó queue-kra is érvényes, nem csak az újakra.
      runner.options = doc.options.queueId
        ? {
            ...doc.options,
            windowFrom: QUEUE_WINDOW_FROM,
            windowTo: QUEUE_WINDOW_TO,
          }
        : doc.options;
      runner.queue = doc.queue ?? [];
      runner.dayStamp = doc.dayStamp ?? new Date().toDateString();
      runner.stopRequested = false;
      Object.assign(runner.state, {
        status: "running",
        sentToday: doc.sentToday ?? 0,
        dailyLimit: doc.options.dailyLimit,
        processed: doc.processed ?? 0,
        failed: doc.failed ?? 0,
        remaining: runner.queue.length,
        current: null,
        nextAt: null,
        startedAt: doc.startedAt,
        message: "Folytatás a szerver újraindulása után.",
        windowFrom: runner.options.windowFrom,
        windowTo: runner.options.windowTo,
        ignoreWindow: doc.options.ignoreWindow,
        testMode: doc.options.testMode ?? false,
        selectedAttachments: doc.options.attachments ?? [],
        minMinutes: doc.options.minMinutes,
        maxMinutes: doc.options.maxMinutes,
        recent: doc.recent ?? [],
        queueId: doc.options.queueId ?? null,
      } satisfies Partial<CampaignState>);

      for (const id of runner.queue) claimed.set(id, account.id);
      log.info(
        `folytatás: ${account.user}, ${runner.queue.length} címzett maradt, ` +
          `ma ${runner.state.sentToday}/${runner.state.dailyLimit}`,
      );
      launch(runner);
      resumed += 1;
    }
  } catch (error) {
    log.error("folytatás nem sikerült", (error as Error).message);
  }
  return resumed;
}

/* ------------------------------------------------------------------ */

/**
 * Előnézet: kiknek és milyen levél menne ki. Semmit nem küld és nem módosít —
 * a felület ebből építi a küldés előtti ellenőrzést.
 */
export async function previewQueue(options: {
  ids?: string[];
  filters?: ContactFilters;
  limit: number;
  attachments?: string[];
  allowSameDomain?: boolean;
}): Promise<{
  total: number;
  /** Küldés előtti ellenőrzés: problémánként darabszám és példák. */
  checks: PreflightSummary[];
  /** Amit a sorból kihagyunk, mert az a cím vagy cég már kapott levelet. */
  skipped: SkipCounts & {
    examples: { company: string; email: string; reason: string }[];
  };
  items: {
    id: string;
    company: string;
    email: string;
    language: string;
    subject: string;
    body: string;
    attachments: string[];
    /** A tételre vonatkozó figyelmeztetések (címkék). */
    warnings: string[];
  }[];
}> {
  // Ugyanazt a sort állítjuk össze, mint az indítás (500-as plafonnal), hogy
  // a "kihagyva" szám és a "vár a sorban" szám is pontos legyen.
  const candidates = options.ids?.length
    ? options.ids
    : await listContactIds(
        {
          ...(options.filters ?? {}),
          hasEmail: "yes",
          sent: "no",
          // Akinél kimenetelt rögzítettél (pl. "ne keresd"), az nem kap levelet.
          outcome: "none",
          sort: "company",
        },
        500,
      );
  const [recipients, contacted] = await Promise.all([
    recipientsFor(candidates),
    contactedIndex(),
  ]);
  const { keep, skipped } = dedupeRecipients(recipients, contacted, {
    allowSameDomain: options.allowSameDomain,
  });

  // Küldés előtti ellenőrzés a teljes megmaradt soron — a blokkoló hibás sor
  // (nincs levél, kitöltetlen {{mező}}) nem kerül a küldési sorba.
  const [rows, bounced] = await Promise.all([
    preflightRows(keep.map((row) => row.id)),
    bouncedDomains(),
  ]);
  const checks = summarize(rows, bounced);
  const issuesById = new Map(
    rows.map((row) => [row.id, issuesFor(row, bounced)]),
  );
  const ids = rows
    .filter((row) => !hasBlocking(issuesById.get(row.id) ?? []))
    .map((row) => row.id);

  const contacts = (
    await Promise.all(
      ids.slice(0, Math.max(1, options.limit)).map((id) => getContactById(id)),
    )
  ).filter((contact): contact is ContactDoc => contact !== null);

  const items = [];
  for (const contact of contacts) {
    if (!contact.primaryEmail || contact.sent || contact.outcome) continue;
    const { files } = options.attachments?.length
      ? await resolveSelection(options.attachments, contact.language)
      : await listAttachments(contact.language);
    items.push({
      id: contact._id,
      company: contact.company,
      email: contact.primaryEmail,
      language: contact.language,
      subject: contact.emailSubject,
      body: contact.emailBody,
      attachments: files.map((file) => file.filename),
      warnings: (issuesById.get(contact._id) ?? []).map((issue) => issue.label),
    });
  }

  return {
    total: ids.length,
    checks,
    skipped: {
      ...countSkips(skipped.map((item) => item.reason)),
      examples: skipped.slice(0, 20).map((item) => ({
        company: item.row.company,
        email: item.row.email,
        reason: SKIP_LABEL[item.reason],
      })),
    },
    items,
  };
}

/** Kiket küldhetünk: van címük, van levelük, még nem kaptak, és nem más fióké. */
/**
 * Follow-up sor: csak a jóváhagyott és még mindig esedékes sorok, a legrégebben
 * kiküldöttel kezdve, és csak azok, akiknek az első levele EBBŐL a fiókból ment
 * (más fiókból érkező „Re:” a címzettnél zavaros lenne).
 */
async function buildFollowUpQueue(runner: Runner): Promise<string[]> {
  const { options, account } = runner;
  const approved = await listContactIds(
    { followUp: "approved", sort: "sent-oldest" },
    5000,
  );
  const approvedSet = new Set(approved);
  const raw = options.ids?.length
    ? options.ids.filter((id) => approvedSet.has(id))
    : approved;
  const candidates = raw.filter((id) => {
    const owner = claimed.get(id);
    return !owner || owner === account.id;
  });

  const originals = await originalOutgoing(candidates);
  const user = account.user.toLowerCase();
  const mine = candidates.filter((id) => {
    const original = originals.get(id);
    return !original?.from || original.from === user;
  });
  const elsewhere = candidates.length - mine.length;
  if (elsewhere) {
    log.info(
      `${account.user}: ${elsewhere} follow-up másik fiókhoz tartozik — azt onnan indítsd`,
    );
  }

  runner.followUpRefs = new Map(
    mine.map((id) => [
      id,
      {
        messageId: originals.get(id)?.messageId ?? null,
        subject: originals.get(id)?.subject ?? "",
      },
    ]),
  );
  runner.state.skipped = { sameEmail: 0, sameDomain: 0, inQueue: 0 };
  for (const id of mine) claimed.set(id, account.id);
  return mine;
}

async function buildQueue(runner: Runner): Promise<string[]> {
  const options = runner.options;
  if (options.mode === "followup") return buildFollowUpQueue(runner);
  const raw = options.ids?.length
    ? options.ids
    : await (async () => {
        const filters: ContactFilters = {
          ...(options.filters ?? {}),
          hasEmail: "yes",
          sent: "no",
          // Akinél kimenetelt rögzítettél (pl. "ne keresd"), az nem kap levelet.
          outcome: "none",
          sort: "company",
        };
        runner.state.remaining = await countContacts(filters);
        return listContactIds(filters, 500);
      })();

  // Amit egy másik fiók már elvitt, azt itt kihagyjuk.
  const unclaimed = raw.filter((id) => {
    const owner = claimed.get(id);
    return !owner || owner === runner.account.id;
  });

  // Aki erre a címre vagy cégdomainre már kapott levelet — bármelyik soron —,
  // az kimarad. A soron belüli ismétlődés is (ugyanaz a cím két forrásból).
  const [recipients, contacted] = await Promise.all([
    recipientsFor(unclaimed),
    contactedIndex(),
  ]);
  const { keep, skipped } = dedupeRecipients(recipients, contacted, {
    allowSameDomain: options.allowSameDomain,
  });
  runner.state.skipped = countSkips(skipped.map((item) => item.reason));
  const summary = skipSummary(runner.state.skipped);
  if (summary) log.info(`${runner.account.user}: ${summary}`);

  // Hiányos levél (nincs szöveg, kitöltetlen {{mező}}) nem megy ki.
  const [rows, bounced] = await Promise.all([
    preflightRows(keep.map((row) => row.id)),
    bouncedDomains(),
  ]);
  const blocked = rows.filter((row) => hasBlocking(issuesFor(row, bounced)));
  if (blocked.length) {
    log.warn(
      `${runner.account.user}: ${blocked.length} sor kihagyva hiányos levél miatt ` +
        `(pl. ${blocked
          .slice(0, 3)
          .map((row) => row.company)
          .join(", ")})`,
    );
  }
  const blockedIds = new Set(blocked.map((row) => row.id));
  const mine = rows
    .filter((row) => !blockedIds.has(row.id))
    .map((row) => row.id);
  for (const id of mine) claimed.set(id, runner.account.id);
  return mine;
}

/**
 * Egy levél kiküldése + a sor megjelölése. Se runner, se ciklus: a helyben
 * futó menet és a serverless tick is ezt hívja.
 */
/** Az eredeti levél adatai egy follow-uphoz (újraindulás után a szinkronból). */
async function followUpRef(
  runner: Runner,
  id: string,
): Promise<{ messageId: string | null; subject: string }> {
  const known = runner.followUpRefs.get(id);
  if (known) return known;
  const original = (await originalOutgoing([id])).get(id);
  return {
    messageId: original?.messageId ?? null,
    subject: original?.subject ?? "",
  };
}

async function deliver(
  account: MailAccount,
  contact: ContactDoc,
  attachments: string[] | undefined,
  /** Follow-upnál az eredeti levél; első levélnél `null`. */
  followUp: { messageId: string | null; subject: string } | null = null,
  /** CV-link a csatolmány helyett (első levélnél). */
  cvUrl: string | null = null,
): Promise<SentItem> {
  const at = new Date().toISOString();
  const collection = await getContacts();

  if (followUp) {
    try {
      const draft = followUpDraft(contact, followUp.subject);
      const result = await sendFollowUpEmail({
        accountId: account.id,
        to: contact.primaryEmail ?? "",
        company: contact.company,
        subject: draft.subject,
        body: draft.body,
        inReplyTo: followUp.messageId ?? contact.sentMessageId ?? null,
      });
      await collection.updateOne({ _id: new ObjectId(contact._id) }, {
        $set: {
          followUpSentAt: at,
          followUpMessageId: result.messageId,
          updatedAt: at,
        },
        $addToSet: { tags: "follow-up-kiment" },
      } as never);
      return {
        company: contact.company,
        email: contact.primaryEmail ?? "",
        at,
        attachments: [],
        followUp: true,
      };
    } catch (error) {
      const message = (error as Error).message;
      log.error(
        `${contact.company} — follow-up nem ment ki (${account.user}): ${message}`,
      );
      return {
        company: contact.company,
        email: contact.primaryEmail ?? "",
        at,
        error: message,
        followUp: true,
      };
    }
  }

  try {
    const result = await sendContactEmail(
      contact,
      attachments,
      account.id,
      cvUrl,
    );
    // Az azonosító kell a későbbi follow-uphoz (egy szálban marad), a fiók pedig
    // ahhoz, hogy a follow-up ugyanonnan menjen.
    await collection.updateOne({ _id: new ObjectId(contact._id) }, {
      $set: { sentMessageId: result.messageId, sentFrom: account.user },
    } as never);
    // Kiküldés után a sor "elküldve" ÉS "kész" — nem kell kézzel kattintani.
    await updateContact(
      contact._id,
      {
        sent: true,
        done: true,
        // A cv-link címke az A/B-méréshez: link vagy csatolmány hozott több választ.
        tags: [
          ...new Set([
            ...contact.tags,
            "kikuldve-automata",
            ...(cvUrl ? ["cv-link"] : []),
          ]),
        ],
      },
      `kiküldés (${account.user})`,
    );
    // Ugyanez a cím más soron is szerepelhet: azok se maradjanak nyitottak.
    if (contact.primaryEmail) {
      const siblings = await markSiblingsSent(
        contact._id,
        contact.primaryEmail,
      );
      if (siblings) {
        log.info(
          `${contact.company}: ${siblings} testvérsor is elküldöttnek jelölve`,
        );
      }
    }
    return {
      company: contact.company,
      email: contact.primaryEmail ?? "",
      at,
      attachments: result.attachments,
    };
  } catch (error) {
    const message = (error as Error).message;
    log.error(`${contact.company} — nem ment ki (${account.user}): ${message}`);
    return {
      company: contact.company,
      email: contact.primaryEmail ?? "",
      at,
      error: message,
    };
  }
}

/**
 * A fiók első küldésének napja: a mentett menetből, vagy ha ott nincs, a
 * Gmail-szinkron legrégebbi kimenő leveléből. Egyszer töltjük be.
 */
async function ensureFirstSend(runner: Runner): Promise<void> {
  if (runner.firstSendAt === undefined) {
    const saved = await (
      await campaigns()
    ).findOne(
      { accountId: runner.account.id },
      { projection: { firstSendAt: 1 } },
    );
    runner.firstSendAt =
      (saved as { firstSendAt?: string | null } | null)?.firstSendAt ??
      (await firstOutgoingFrom(runner.account.user));
  }
  runner.state.warmupCap = capOf(runner);
}

/** A fiók felfuttatási plafonja — `null`, ha túl van rajta, vagy ki van kapcsolva. */
function capOf(runner: Runner): number | null {
  return runner.account.warmup
    ? warmupCap(runner.firstSendAt, runner.account.provider)
    : null;
}

/** A fiók saját napi maximuma — csak kikapcsolt felfuttatásnál él. */
function maxOf(runner: Runner): number | null {
  return runner.account.warmup ? null : runner.account.dailyMax;
}

/**
 * A tényleges napi keret: az indításkor beállított, a felfuttatási plafon és a
 * fiók saját maximuma közül a legkisebb.
 */
function dailyLimitOf(runner: Runner): number {
  return Math.min(
    runner.options.dailyLimit,
    capOf(runner) ?? Infinity,
    maxOf(runner) ?? Infinity,
  );
}

async function run(runner: Runner): Promise<void> {
  const { options, state, account } = runner;
  await ensureFirstSend(runner);

  log.info(
    `indul (${account.user}): ${runner.queue.length} címzett a sorban, ` +
      `napi keret ${dailyLimitOf(runner)}${
        runner.state.warmupCap
          ? ` (${warmupLabel(runner.firstSendAt, account.provider)})`
          : ""
      }, ` +
      `szünet ${options.minMinutes}-${options.maxMinutes} perc, ` +
      (options.testMode
        ? `TESZT MÓD: időkorlát nélkül, legfeljebb ${TEST_MODE_LIMIT} levél`
        : options.ignoreWindow
          ? "MUNKAIDŐN KÍVÜL IS: éjjel és hétvégén is küld"
          : `${options.windowFrom}:00-${options.windowTo}:00 között, a címzett helyi idejében`),
  );

  if (!runner.queue.length) {
    state.status = "done";
    state.message =
      "Nincs kiküldhető levél: mindenkinek elment, vagy nincs címe.";
    await persist(runner);
    return;
  }

  let failuresInARow = 0;

  while (runner.queue.length) {
    if (runner.stopRequested) {
      state.message = `Leállítva ${state.processed} levél után.`;
      log.warn(`${account.user}: ${state.message}`);
      break;
    }

    resetDailyCounterIfNeeded(runner);
    if (state.sentToday >= dailyLimitOf(runner)) {
      state.message =
        `Mai keret elfogyott (${state.sentToday}/${dailyLimitOf(runner)}${
          runner.state.warmupCap
            ? `, ${warmupLabel(runner.firstSendAt, account.provider)}`
            : ""
        }). ` + "Holnap folytatható.";
      log.info(`${account.user}: ${state.message}`);
      break;
    }

    // Teszt mód (időkorlát nélkül): indításonként legfeljebb néhány levél —
    // így nem mehet ki egy egész éjszakányi kampány egy bent felejtett pipától.
    if (options.testMode && state.processed >= TEST_MODE_LIMIT) {
      state.message =
        `Teszt mód: ${TEST_MODE_LIMIT} levél kiment, leálltam. ` +
        "Éles kampányhoz kapcsold ki a teszt módot.";
      log.info(`${account.user}: ${state.message}`);
      break;
    }

    // Munkaidő a CÍMZETT helyi idejében: azt vesszük előre, akinél most van.
    // Az ablakot a teszt mód és a „munkaidőn kívül is” egyaránt kikapcsolja.
    if (!options.ignoreWindow && !options.testMode) {
      const pick = await pickInsideWindow(runner);
      if ("waitUntil" in pick) {
        const zone = timeZoneFor(pick.country);
        state.current = null;
        state.nextAt = pick.waitUntil.toISOString();
        state.message =
          `Most senkinél nincs munkaidő a sorban — a következő: ` +
          `${COUNTRIES[pick.country]?.hu ?? "nemzetközi"}, ` +
          `${localLabel(pick.waitUntil, zone)} (helyi idő), ` +
          `nálunk ${localLabel(pick.waitUntil, "Europe/Budapest")}.`;
        // Darabokban alszunk, hogy a napváltást is észrevegyük; a leállítás
        // viszont azonnal felébreszt.
        await sleep(
          runner,
          Math.min(pick.waitUntil.getTime() - Date.now(), 15 * 60_000),
        );
        continue;
      }
      const index = runner.queue.indexOf(pick.id);
      if (index > 0) {
        runner.queue.splice(index, 1);
        runner.queue.unshift(pick.id);
      }
    }

    // A sorból csak akkor veszünk ki, ha tényleg sorra kerül — így egy
    // újraindulás után is pontosan innen folytatódik.
    const id = runner.queue[0];
    const contact = await getContactById(id);
    const followUp = options.mode === "followup";
    // Közvetlenül a küldés előtt: follow-upnál még mindig esedékes és jóváhagyott
    // (ha közben válasz jött, nem megy ki); első levélnél még nem kapott levelet.
    const eligible = followUp
      ? Boolean(contact && isFollowUpDue(contact) && contact.followUpApprovedAt)
      : Boolean(
          contact && contact.primaryEmail && !contact.sent && !contact.outcome,
        );
    if (!contact || !contact.primaryEmail || !eligible) {
      runner.queue.shift();
      claimed.delete(id);
      state.remaining = runner.queue.length;
      continue;
    }

    // A sor összeállítása óta egy másik fiók is küldhetett erre a címre vagy
    // cégre: közvetlenül a küldés előtt még egyszer megnézzük.
    const duplicate = followUp
      ? null
      : await alreadyContacted(contact._id, contact.primaryEmail, {
          allowSameDomain: options.allowSameDomain,
        });
    if (duplicate) {
      log.warn(`${contact.company} kihagyva — ${SKIP_LABEL[duplicate]}`);
      runner.queue.shift();
      claimed.delete(id);
      state.remaining = runner.queue.length;
      const counts = state.skipped ?? {
        sameEmail: 0,
        sameDomain: 0,
        inQueue: 0,
      };
      state.skipped = {
        ...counts,
        sameEmail: counts.sameEmail + (duplicate === "same-email" ? 1 : 0),
        sameDomain: counts.sameDomain + (duplicate === "same-domain" ? 1 : 0),
      };
      continue;
    }

    // Az utolsó szó az adatbázisé: ha bárhonnan leállították, itt megállunk.
    if (runner.stopRequested || (await stopRequestedInDb(account.id))) {
      runner.stopRequested = true;
      state.message = `Leállítva ${state.processed} levél után.`;
      log.warn(
        `${account.user}: leállítás az adatbázisból — nem küldök több levelet`,
      );
      break;
    }

    state.current = contact.company;
    state.remaining = runner.queue.length;
    state.message = null;
    log.info(
      `küldés ${state.sentToday + 1}/${dailyLimitOf(runner)} (${account.user}): ` +
        `${contact.company} → ${contact.primaryEmail}`,
    );

    const item = await deliver(
      runner.account,
      contact,
      options.attachments,
      followUp ? await followUpRef(runner, contact._id) : null,
      options.cvLink ? credential("CV_URL") || null : null,
    );
    runner.queue.shift();
    claimed.delete(id);

    state.processed += 1;
    state.recent.unshift(item);
    if (state.recent.length > 50) state.recent.pop();

    if (item.error) {
      state.failed += 1;
      failuresInARow += 1;
      // Sorozatos hiba: jelszó, limit vagy hálózat. Nincs értelme tovább hajtani.
      if (failuresInARow >= 3) {
        state.status = "error";
        state.message =
          "Három egymás utáni sikertelen küldés után leálltam. Nézd meg a naplót.";
        log.error(`${account.user}: ${state.message}`);
        state.current = null;
        await persist(runner);
        return;
      }
    } else {
      failuresInARow = 0;
      state.sentToday += 1;
      // A felfuttatás az első sikeres küldéstől számít.
      if (!runner.firstSendAt) {
        runner.firstSendAt = item.at;
        state.warmupCap = capOf(runner);
      }
    }
    state.remaining = runner.queue.length;
    await persist(runner);

    if (state.sentToday >= dailyLimitOf(runner) || !runner.queue.length)
      continue;

    const wait = pause(options);
    state.current = null;
    state.nextAt = new Date(Date.now() + wait).toISOString();
    log.debug(
      `${account.user}: következő levél ${Math.round(wait / 60000)} perc múlva`,
    );
    await sleep(runner, wait);
  }

  state.current = null;
  state.nextAt = null;
  state.remaining = runner.queue.length;
  if (state.status === "running" || state.status === "stopping") {
    state.status = runner.stopRequested ? "idle" : "done";
    if (runner.stopRequested && !state.processed) {
      state.message = "Leállítva — egy levél sem ment ki.";
    }
  }
  for (const id of runner.queue) claimed.delete(id);
  log.info(
    `vége (${account.user}): ${state.processed} feldolgozva, ` +
      `${state.sentToday} kiment ma, ${state.failed} hiba`,
  );
  await persist(runner);
}

/** A menet elindítása a háttérben. A kérés nem várja meg. */
function launch(runner: Runner): void {
  runner.running = true;
  void run(runner)
    .catch(async (error: Error) => {
      runner.state.status = "error";
      runner.state.message = error.message;
      runner.state.current = null;
      log.error(`a küldés elszállt (${runner.account.user})`, error.message);
      await persist(runner);
    })
    .finally(() => {
      runner.running = false;
    });
}

/**
 * Próbalevél saját magadnak: az első sorba álló cég levelét küldi el a fiók
 * saját címére, csatolmányokkal együtt. A cég nem kap semmit, és semmit nem
 * jelölünk elküldöttnek — csak látod, hogyan fog kinézni.
 */
export async function sendSelfTest(
  contactId = "",
  attachments?: string[],
  accountId?: string | null,
): Promise<{ ok: boolean; message: string }> {
  const config = mailerConfig(accountId);
  if (!config) {
    return { ok: false, message: "Nincs beállítva a Gmail-küldés." };
  }

  const contact = contactId
    ? await getContactById(contactId)
    : await (async () => {
        const [first] = await listContactIds(
          { hasEmail: "yes", sent: "no", sort: "company" },
          1,
        );
        return first ? getContactById(first) : null;
      })();

  if (!contact) {
    return { ok: false, message: "Nem találtam mintasort a próbalevélhez." };
  }

  try {
    // A címzettet átírjuk magunkra, minden más marad.
    const result = await sendContactEmail(
      {
        ...contact,
        primaryEmail: config.user,
        emailSubject: `[PRÓBA – ${contact.company}] ${contact.emailSubject}`,
      },
      attachments,
      config.id,
    );
    log.info(`próbalevél elment magadnak: ${config.user}`, {
      minta: contact.company,
      csatolmany: result.attachments,
    });
    return {
      ok: true,
      message:
        `Próbalevél elküldve ide: ${config.user} — a(z) "${contact.company}" ` +
        `levelével. Csatolva: ${result.attachments.join(", ") || "semmi"}. ` +
        "A cég nem kapott semmit.",
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function startCampaign(
  options: CampaignOptions,
): Promise<CampaignState | { error: string }> {
  if (SERVERLESS) return { error: SERVERLESS_MESSAGE };

  const account = getAccount(options.accountId);
  if (!account) {
    return {
      error:
        "Nincs ilyen küldő fiók. Az atlas-credentials.env-be kell GMAIL_USER / " +
        "GMAIL_APP_PASSWORD (és a továbbiakhoz GMAIL_USER_2, _3 …).",
    };
  }

  const runner = runnerFor(account);
  if (runner.state.status === "running" || runner.state.status === "stopping") {
    return { ...runner.state, recent: [...runner.state.recent] };
  }

  resetDailyCounterIfNeeded(runner);
  runner.stopRequested = false;
  runner.options = { ...options, accountId: account.id };
  Object.assign(runner.state, {
    status: "running",
    processed: 0,
    failed: 0,
    current: null,
    nextAt: null,
    startedAt: new Date().toISOString(),
    message: null,
    dailyLimit: options.dailyLimit,
    windowFrom: options.windowFrom,
    windowTo: options.windowTo,
    ignoreWindow: options.ignoreWindow,
    testMode: options.testMode === true,
    selectedAttachments: options.attachments ?? [],
    minMinutes: options.minMinutes,
    maxMinutes: options.maxMinutes,
    recent: [],
    queueId: options.queueId ?? null,
  } satisfies Partial<CampaignState>);

  runner.queue = await buildQueue(runner);
  runner.state.remaining = runner.queue.length;
  runner.state.message = runner.state.skipped
    ? skipSummary(runner.state.skipped)
    : null;

  // Új indítás: a korábbi leállítási jelzés már nem érvényes.
  await (
    await campaigns()
  ).updateOne({ accountId: account.id }, { $set: { stopRequested: false } });
  await persist(runner);
  launch(runner);
  return { ...runner.state, recent: [...runner.state.recent] };
}
