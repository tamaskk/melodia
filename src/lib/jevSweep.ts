/**
 * Folyamatos cégértékelés a Jev modellel: végigmegy az adatbázis cégein, és
 * mindegyikre felteszi ugyanazt az igen/nem kérdést.
 *
 * Ugyanaz a felépítés, mint a többi begyűjtésnél (`peopleSweep.ts`): a futás a
 * szerver folyamatában él, bármikor leállítható, a felület lekérdezi az
 * állapotot. Az eredmény a `jevResults` gyűjteménybe kerül, a kontaktokhoz nem
 * nyúl. Egy cég egy kérdésre csak egyszer fut le — az egyedi index ezt akkor
 * is garantálja, ha a futást újraindítják.
 */
import { ObjectId, type Collection, type Filter } from "mongodb";
import { buildQuery } from "./contacts";
import { COUNTRIES } from "./countries";
import { askBoolean, JevError } from "./jev";
import type { FoundStartup } from "./startupFinder";
import { createLogger } from "./logger";
import { getContacts, getDb } from "./mongodb";
import type { Contact, ContactFilters, JevVerdict } from "./types";

const log = createLogger("jev-kereses");

export interface JevResult {
  /** Egy cég egy kérdésre egyszer: domain, vagy cégnév + ország. */
  companyKey: string;
  question: string;
  /** Webes találatnál null, amíg nincs felvéve a kontaktok közé. */
  contactId: string | null;
  /** "web" = az internetről jött, nem az adatbázisból. */
  origin?: "web";
  /** Webes találat: amit a keresés a cégről hozott. */
  found?: FoundStartup;
  /** Webes találat: már bent volt-e az adatbázisban. */
  alreadyInDb?: boolean;
  /** Webes lead: felvettük-e a kontaktok közé. */
  imported?: boolean;
  company: string;
  website: string | null;
  country: string;
  source: string;
  /** Amit a modell kapott — hogy utólag is látszódjon, mi alapján döntött. */
  state: string;
  probability: number;
  lead: boolean;
  threshold: number;
  cost: number | null;
  inputTokens: number | null;
  elapsedMs: number;
  evaluatedAt: string;
}

export interface JevSweepState {
  status: "idle" | "running" | "stopping" | "done" | "error";
  question: string;
  threshold: number;
  concurrency: number;
  filters: ContactFilters;
  /** Ebben a futásban értékelt cégek. */
  processed: number;
  leads: number;
  failed: number;
  /** Már korábban értékelt, ezért kihagyott cégek. */
  skipped: number;
  costTotal: number;
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
  active: string[];
}

export interface JevSweepOptions {
  question: string;
  threshold: number;
  concurrency: number;
  filters: ContactFilters;
}

const BATCH = 50;
/** Ennyi egymás utáni hiba után leállunk — valami nem átmeneti. */
const MAX_FAILS_IN_ROW = 5;

const state: JevSweepState = {
  status: "idle",
  question: "",
  threshold: 0.8,
  concurrency: 3,
  filters: {},
  processed: 0,
  leads: 0,
  failed: 0,
  skipped: 0,
  costTotal: 0,
  startedAt: null,
  finishedAt: null,
  message: null,
  active: [],
};

let stopRequested = false;
let indexesReady: Promise<unknown> | null = null;

export async function getJevResults(): Promise<Collection<JevResult>> {
  const collection = (await getDb()).collection<JevResult>("jevResults");
  indexesReady ??= Promise.all([
    collection.createIndex(
      { companyKey: 1, question: 1 },
      { unique: true, name: "company_question" },
    ),
    collection.createIndex(
      { question: 1, evaluatedAt: -1 },
      { name: "question_newest" },
    ),
    collection.createIndex(
      { question: 1, lead: 1, evaluatedAt: -1 },
      { name: "question_leads" },
    ),
  ]);
  await indexesReady;
  return collection;
}

export function jevSweepState(): JevSweepState {
  return { ...state, active: [...state.active] };
}

export function stopJevSweep(): JevSweepState {
  if (state.status === "running") {
    stopRequested = true;
    state.status = "stopping";
    state.message = "Leállítás kérve — az épp futó cégek még befejeződnek.";
    log.warn("leállítás kérve");
  }
  return jevSweepState();
}

type Candidate = Pick<
  Contact,
  | "company"
  | "website"
  | "country"
  | "city"
  | "size"
  | "kind"
  | "category"
  | "tags"
  | "note"
  | "source"
  | "seedtable"
> & { _id: ObjectId; domain?: string | null };

/**
 * A döntés a kontakton is: így a főoldalon szűrhető. Ugyanannak a cégnek
 * minden sora megkapja (domain, vagy cégnév + ország alapján).
 */
export async function saveVerdict(
  match: Filter<Contact>,
  verdict: JevVerdict,
): Promise<number> {
  const contacts = await getContacts();
  const result = await contacts.updateMany(match, { $set: { jev: verdict } });
  return result.modifiedCount;
}

function sameCompany(contact: Candidate): Filter<Contact> {
  return contact.domain
    ? ({ domain: contact.domain } as Filter<Contact>)
    : { company: contact.company, country: contact.country };
}

function companyKeyOf(contact: Candidate): string {
  if (contact.domain) return contact.domain.toLowerCase();
  return `${contact.company.trim().toLowerCase()}|${contact.country}`;
}

/** A jegyzetből kiveszi a belső sorokat (pontszám, e-mail forrása). */
function cleanNote(note: string | null): string | null {
  if (!note) return null;
  return note
    .split(/\s*(?:\||·|\n)\s*/)
    .map((part) => part.replace(/Pontszám:[^.]*\.?/i, "").trim())
    .filter((part) => part && !/^e-mail forrása:/i.test(part))
    .join(" · ")
    .replace(/^Profil:\s*/i, "");
}

/** A cég adatai egy bekezdésben, angolul — ezt kapja a modell állapotként. */
export function companyState(contact: Candidate): string {
  const seed = contact.seedtable;
  const parts: [string, unknown][] = [
    ["Company", contact.company],
    ["Website", contact.website],
    [
      "Location",
      [contact.city, COUNTRIES[contact.country]?.en ?? contact.country]
        .filter(Boolean)
        .join(", "),
    ],
    [
      "Size",
      seed?.employeeCount
        ? `${seed.employeeCount} employees`
        : contact.size && contact.size !== "ismeretlen"
          ? `${contact.size} employees`
          : null,
    ],
    ["Industry", seed?.industry],
    ["Founded", seed?.foundedYear],
    ["Status", seed?.status],
    ["Funding stage", seed?.fundingStage],
    [
      "Total funding",
      seed?.totalFunding
        ? `$${seed.totalFunding.toLocaleString("en-US")}`
        : null,
    ],
    ["Last funding date", seed?.lastFundingDate],
    ["Description", seed?.description],
    // A saját címkéink (van-email, kikuldve-…) belső állapotok, nem a cégről
    // szólnak — csak a Seedtable-címkék mennek.
    ["Tags", (seed?.tags ?? []).join(", ")],
    // A Seedtable-soroknál a jegyzet a leírást ismétli — az csak token.
    ["Notes", seed?.description ? null : cleanNote(contact.note)],
  ];
  return parts
    .filter(([, value]) => value != null && String(value).trim() !== "")
    .map(([label, value]) => `${label}: ${String(value).trim().replace(/\.+$/, "")}.`)
    .join(" ");
}

async function evaluate(
  contact: Candidate,
  results: Collection<JevResult>,
  options: JevSweepOptions,
): Promise<void> {
  const companyKey = companyKeyOf(contact);
  const stateText = companyState(contact);
  state.active.push(contact.company);
  try {
    const run = await askBoolean(stateText, options.question);
    const lead = run.probability >= options.threshold;
    try {
      await results.insertOne({
        companyKey,
        question: options.question,
        contactId: contact._id.toHexString(),
        company: contact.company,
        website: contact.website ?? null,
        country: contact.country,
        source: contact.source,
        state: stateText,
        probability: run.probability,
        lead,
        threshold: options.threshold,
        cost: run.cost,
        inputTokens: run.inputTokens,
        elapsedMs: run.elapsedMs,
        evaluatedAt: new Date().toISOString(),
      });
    } catch (error) {
      // Párhuzamos szál már beírta ugyanezt a céget — nem hiba.
      if ((error as { code?: number }).code === 11000) {
        state.skipped += 1;
        return;
      }
      throw error;
    }
    await saveVerdict(sameCompany(contact), {
      probability: run.probability,
      question: options.question,
      lead,
      at: new Date().toISOString(),
    });
    state.processed += 1;
    state.costTotal += run.cost ?? 0;
    if (lead) state.leads += 1;
    log.info(
      `${contact.company} → ${run.probability.toFixed(2)}${lead ? " · LEAD" : ""}`,
      { ms: run.elapsedMs },
    );
  } finally {
    state.active.splice(state.active.indexOf(contact.company), 1);
  }
}

async function loop(options: JevSweepOptions): Promise<void> {
  const contacts = await getContacts();
  const results = await getJevResults();
  const base = buildQuery(options.filters);
  let cursor: ObjectId | null = null;
  let failsInRow = 0;

  while (!stopRequested) {
    const filter: Filter<Contact> = cursor
      ? ({ $and: [base, { _id: { $gt: cursor } }] } as Filter<Contact>)
      : base;
    const batch = (await contacts
      .find(filter, {
        projection: {
          company: 1,
          website: 1,
          domain: 1,
          country: 1,
          city: 1,
          size: 1,
          kind: 1,
          category: 1,
          tags: 1,
          note: 1,
          source: 1,
          seedtable: 1,
        },
      })
      .sort({ _id: 1 })
      .limit(BATCH)
      .toArray()) as unknown as Candidate[];
    if (batch.length === 0) {
      state.message = "Elfogyott a szűrőnek megfelelő, még nem értékelt cég.";
      return;
    }
    cursor = batch[batch.length - 1]._id;

    // Ugyanaz a cég többször is szerepelhet (több kontakt) — kötegen belül és
    // a korábbi futásokhoz képest is csak egyszer kérdezünk.
    const keys = [...new Set(batch.map(companyKeyOf))];
    const done = new Set(
      (
        await results
          .find(
            { question: options.question, companyKey: { $in: keys } },
            { projection: { companyKey: 1 } },
          )
          .toArray()
      ).map((doc) => doc.companyKey),
    );
    const seen = new Set<string>();
    const todo = batch.filter((contact) => {
      const key = companyKeyOf(contact);
      if (done.has(key) || seen.has(key) || !contact.company?.trim())
        return false;
      seen.add(key);
      return true;
    });
    state.skipped += batch.length - todo.length;

    // Egyszerre `concurrency` cég; ha egy végez, jön a következő.
    let next = 0;
    const worker = async () => {
      while (!stopRequested && next < todo.length) {
        const contact = todo[next++];
        try {
          await evaluate(contact, results, options);
          failsInRow = 0;
        } catch (error) {
          state.failed += 1;
          failsInRow += 1;
          const message =
            error instanceof Error ? error.message : String(error);
          log.error(`${contact.company} — hiba`, { message });
          // Számlázási vagy kulcshiba: nincs értelme a következő céggel próbálni.
          const status = (
            (error as { cause?: { statusCode?: number } }).cause ?? {}
          ).statusCode;
          const fatal =
            error instanceof JevError &&
            (status === undefined || [401, 402, 403].includes(status));
          if (fatal || failsInRow >= MAX_FAILS_IN_ROW) {
            state.message = message;
            stopRequested = true;
            state.status = "error";
          }
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(options.concurrency, todo.length) },
        worker,
      ),
    );
  }
}

export function startJevSweep(options: JevSweepOptions): JevSweepState {
  if (state.status === "running" || state.status === "stopping") {
    return jevSweepState();
  }
  Object.assign(state, {
    status: "running",
    question: options.question,
    threshold: options.threshold,
    concurrency: options.concurrency,
    filters: options.filters,
    processed: 0,
    leads: 0,
    failed: 0,
    skipped: 0,
    costTotal: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: null,
    active: [],
  } satisfies JevSweepState);
  stopRequested = false;
  log.info("indul", {
    threshold: options.threshold,
    concurrency: options.concurrency,
  });

  void loop(options)
    .catch((error) => {
      state.status = "error";
      state.message = error instanceof Error ? error.message : String(error);
      log.error("a futás megállt", { message: state.message });
    })
    .finally(() => {
      if (state.status !== "error") state.status = "done";
      state.finishedAt = new Date().toISOString();
      state.active = [];
      log.info("vége", {
        processed: state.processed,
        leads: state.leads,
        failed: state.failed,
      });
    });

  return jevSweepState();
}

/** A legutóbbi eredmények egy kérdésre, lapozva; a darabszámot a szerver adja. */
export async function listJevResults(
  question: string,
  leadsOnly: boolean,
  limit: number,
  origin: "db" | "web" = "db",
): Promise<{ items: JevResult[]; total: number; leads: number }> {
  const results = await getJevResults();
  const base: Filter<JevResult> =
    origin === "web"
      ? { question, origin: "web" }
      : { question, origin: { $exists: false } };
  const filter: Filter<JevResult> = leadsOnly ? { ...base, lead: true } : base;
  const [items, total, leads] = await Promise.all([
    results
      .find(filter, { projection: { _id: 0 } })
      .sort({ evaluatedAt: -1 })
      .limit(limit)
      .toArray(),
    results.countDocuments(base),
    results.countDocuments({ ...base, lead: true }),
  ]);
  return { items, total, leads };
}
