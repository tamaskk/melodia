/**
 * Kapcsolattartó-begyűjtés: végigmegy a cégeken, és **egyesével** megkeresi,
 * kinél érdemes jelentkezni (HR + vezetés).
 *
 * Ugyanaz a felépítés, mint az e-mail begyűjtésnél (`emailSweep.ts`): a futás a
 * szerver folyamatában él, a kérés lezárása után is megy, bármikor leállítható,
 * és minden lépés a naplóba kerül. Azért külön modul, mert külön is kell tudni
 * indítani: van, akinél már megvan a cím, de nem tudjuk, kinek írjunk.
 */
import {
  countContacts,
  getContactById,
  listContactIds,
  savePeople,
} from "./contacts";
import { findPeople } from "./peopleFinder";
import type { SearchProvider } from "./emailFinder";
import { cliConcurrency, setCliConcurrency } from "./cliQueue";
import { createLogger } from "./logger";
import { sweepTracker } from "./queueStats";
import type { ContactDoc, ContactFilters } from "./types";

const log = createLogger("emberek");

export interface PeopleSweepItem {
  company: string;
  contactId: string;
  /** Hány embert találtunk, kategóriánként. */
  people: number;
  hr: number;
  leaders: number;
  /** A legelső név — a felületen ez látszik. */
  first: string | null;
  ms: number;
  error?: string;
}

export interface PeopleSweepState {
  status: "idle" | "running" | "stopping" | "done" | "error";
  provider: SearchProvider;
  total: number;
  processed: number;
  /** Hány cégnél lett legalább egy ember, és összesen hány embert találtunk. */
  found: number;
  peopleTotal: number;
  failed: number;
  current: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  etaSeconds: number | null;
  message: string | null;
  scope: "adatbazis" | "kijelolt" | "szurt";
  candidates: number;
  /** Egyszerre hány cégen dolgozunk. */
  concurrency: number;
  /** Amin épp dolgozunk — a felület ezeket mutatja töltés-jelzéssel. */
  active: { company: string; startedAt: string }[];
  recent: PeopleSweepItem[];
}

export interface PeopleSweepOptions {
  provider: SearchProvider;
  /** 0 = az összes találat. Csak `ids` nélkül számít. */
  limit: number;
  /** Hagyja ki, akinél már futott kapcsolattartó-keresés. */
  skipSearched: boolean;
  delayMs: number;
  /** Egyszerre hány cégen dolgozzon (1-8). Ha egy végez, jön a következő. */
  concurrency?: number;
  ids?: string[];
  filters?: ContactFilters;
}

const state: PeopleSweepState = {
  status: "idle",
  provider: "claude",
  total: 0,
  processed: 0,
  found: 0,
  peopleTotal: 0,
  failed: 0,
  current: null,
  startedAt: null,
  finishedAt: null,
  etaSeconds: null,
  message: null,
  scope: "adatbazis",
  candidates: 0,
  concurrency: 1,
  active: [],
  recent: [],
};

let stopRequested = false;
let running: Promise<void> | null = null;

export function peopleSweepState(): PeopleSweepState {
  return { ...state, active: [...state.active], recent: [...state.recent] };
}

export function stopPeopleSweep(): PeopleSweepState {
  if (state.status === "running") {
    stopRequested = true;
    state.status = "stopping";
    state.message = "Leállítás kérve — az épp futó cég még befejeződik.";
    log.warn("leállítás kérve");
  }
  return peopleSweepState();
}

function hasFilters(filters?: ContactFilters): boolean {
  if (!filters) return false;
  return Object.entries(filters).some(
    ([key, value]) => Boolean(value) && key !== "sort",
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function processOne(
  contact: ContactDoc,
  provider: SearchProvider,
  position: string,
): Promise<PeopleSweepItem> {
  const started = Date.now();
  log.info(`${position} · ${contact.company} — kapcsolattartók keresése`);

  try {
    const finding = await findPeople(contact, provider, "sweep");
    const saved = await savePeople(contact._id, finding.people, finding.notes);

    const hr = saved.filter((person) => person.category === "hr").length;
    const leaders = saved.filter(
      (person) => person.category === "vezetes",
    ).length;
    const ms = Date.now() - started;

    log.info(
      `${position} · ${contact.company} → ${saved.length} fő (${hr} HR, ${leaders} vezetés)`,
      { ms },
    );

    return {
      company: contact.company,
      contactId: contact._id,
      people: saved.length,
      hr,
      leaders,
      first: saved[0]?.name ?? null,
      ms,
    };
  } catch (error) {
    const message = (error as Error).message;
    log.error(`${position} · ${contact.company} — hiba: ${message}`);
    return {
      company: contact.company,
      contactId: contact._id,
      people: 0,
      hr: 0,
      leaders: 0,
      first: null,
      ms: Date.now() - started,
      error: message,
    };
  }
}

/** Kiket nézünk végig: alapból akinél még nincs ember és még nem kerestünk. */
async function loadQueue(options: PeopleSweepOptions): Promise<string[]> {
  if (options.ids?.length) {
    state.candidates = options.ids.length;
    return options.ids;
  }

  const filters: ContactFilters = {
    ...(options.filters ?? {}),
    hasPeople: "no",
    ...(options.skipSearched ? { peopleSearched: "no" as const } : {}),
    sort: "company",
  };

  state.candidates = await countContacts(filters);
  return listContactIds(filters, options.limit > 0 ? options.limit : 0);
}

async function run(options: PeopleSweepOptions): Promise<void> {
  const queue = await loadQueue(options);
  state.total = queue.length;
  state.message = null;

  log.info(
    options.ids?.length
      ? `indul: ${queue.length} kijelölt cég (${options.provider}), egyesével`
      : `indul: ${queue.length} cég a(z) ${state.candidates} lehetségesből ` +
          `(${options.provider}, ${state.scope === "szurt" ? "szűrt lista" : "teljes adatbázis"})`,
    { szunetMs: options.delayMs, limit: options.limit },
  );

  if (!queue.length) {
    state.status = "done";
    state.finishedAt = new Date().toISOString();
    state.message = options.ids?.length
      ? "A kijelölt sorok nem találhatók."
      : "Nincs feldolgozandó cég — mindegyiknél van már ember, vagy már kerestünk.";
    return;
  }

  // A telefonos widget ebből látja a futást — a keresés nem vár rá.
  const tracker = sweepTracker("research:people");
  tracker.started(queue.length);

  let consecutiveErrors = 0;
  let cursor = 0;
  // Ennyin dolgozunk egyszerre; amint egy végez, ugyanaz a munkás viszi a
  // következőt — így mindig `concurrency` darab fut.
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 1));
  const working = new Map<string, string>();
  const showCurrent = () => {
    const names = [...working.keys()];
    state.current = names.length
      ? names.slice(0, 3).join(" · ") +
        (names.length > 3 ? ` +${names.length - 3}` : "")
      : null;
    // A felület ebből rajzolja a töltés-jelzős sorokat a lista tetején.
    state.active = names.map((company) => ({
      company,
      startedAt: working.get(company) ?? new Date().toISOString(),
    }));
  };

  const worker = async (): Promise<void> => {
    while (!stopRequested && consecutiveErrors < 3) {
      const index = cursor;
      cursor += 1;
      if (index >= queue.length) return;

      const contact = await getContactById(queue[index]);
      if (!contact) continue;

      working.set(contact.company, new Date().toISOString());
      showCurrent();
      tracker.itemStarted();
      const item = await processOne(
        contact,
        options.provider,
        `${index + 1}/${queue.length}`,
      );
      working.delete(contact.company);
      showCurrent();

      tracker.itemFinished(Boolean(item.error));
      state.processed += 1;
      if (item.error) {
        state.failed += 1;
        consecutiveErrors += 1;
      } else {
        consecutiveErrors = 0;
        if (item.people > 0) state.found += 1;
        state.peopleTotal += item.people;
      }

      state.recent.unshift(item);
      if (state.recent.length > 50) state.recent.pop();

      const elapsed =
        Date.now() - new Date(state.startedAt ?? Date.now()).getTime();
      state.etaSeconds = Math.round(
        ((queue.length - state.processed) * (elapsed / state.processed)) / 1000,
      );

      if (options.delayMs > 0 && cursor < queue.length) {
        await sleep(options.delayMs);
      }
    }
  };

  log.info(`${concurrency} szálon dolgozunk`);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (consecutiveErrors >= 3) {
    state.message =
      "Három egymás utáni hiba után leálltam (limit vagy hálózati gond lehet).";
    log.error(state.message);
  } else if (stopRequested) {
    state.message = `Leállítva ${state.processed}/${state.total} után.`;
    log.warn(state.message);
  }

  tracker.finished({
    unprocessed: queue.length - state.processed,
    error: consecutiveErrors >= 3 ? state.message : null,
  });

  state.current = null;
  state.active = [];
  state.finishedAt = new Date().toISOString();
  state.status = stopRequested ? "idle" : "done";
  state.etaSeconds = null;
  log.info(
    `vége: ${state.processed}/${state.total} cég, ${state.found} találattal, ` +
      `${state.peopleTotal} ember, ${state.failed} hiba`,
  );
}

export function startPeopleSweep(
  options: PeopleSweepOptions,
): PeopleSweepState {
  if (state.status === "running" || state.status === "stopping")
    return peopleSweepState();

  stopRequested = false;
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 1));
  const previousLimit = cliConcurrency();
  setCliConcurrency(Math.max(previousLimit, concurrency));
  Object.assign(state, {
    status: "running",
    concurrency,
    provider: options.provider,
    scope: options.ids?.length
      ? "kijelolt"
      : hasFilters(options.filters)
        ? "szurt"
        : "adatbazis",
    candidates: 0,
    total: 0,
    processed: 0,
    found: 0,
    peopleTotal: 0,
    failed: 0,
    current: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    etaSeconds: null,
    message: null,
    active: [],
    recent: [],
  } satisfies Partial<PeopleSweepState>);

  running = run(options)
    .catch((error: Error) => {
      state.status = "error";
      state.message = error.message;
      state.current = null;
      log.error("a futás elszállt", error.message);
    })
    .finally(() => {
      running = null;
      setCliConcurrency(previousLimit);
    });

  return peopleSweepState();
}

/** Teszthez: megvárja a futó menetet. */
export function peopleSweepPromise(): Promise<void> | null {
  return running;
}
