/**
 * Automatikus e-mail begyűjtés: végigmegy az adatbázison, és **egyesével**
 * megkeresi minden cím nélküli cég publikus e-mail címét.
 *
 * A futás a szerver folyamatában él, a kérés lezárása után is megy tovább.
 * Minden lépés a naplóba kerül (terminál + /debug), az állapotot a felület
 * lekérdezheti, és bármikor leállítható.
 */
import {
  countContacts,
  getContactById,
  listContactIds,
  saveEmailSearch,
  updateContact,
} from "./contacts";
import { findEmail, type SearchProvider } from "./emailFinder";
import { cliBusy, cliConcurrency, setCliConcurrency } from "./cliQueue";
import { createLogger } from "./logger";
import type { ContactDoc, ContactFilters } from "./types";

const log = createLogger("sweep");

export interface SweepItem {
  company: string;
  email: string | null;
  confidence: string;
  filled: boolean;
  ms: number;
  error?: string;
}

export interface SweepState {
  status: "idle" | "running" | "stopping" | "done" | "error";
  provider: SearchProvider;
  total: number;
  processed: number;
  found: number;
  filled: number;
  failed: number;
  /** Épp ezen dolgozik. */
  current: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** Becsült hátralévő idő másodpercben, az eddigi átlagból. */
  etaSeconds: number | null;
  message: string | null;
  /** Mit visz végig: kijelölt sorok, a szűrt lista, vagy a teljes adatbázis. */
  scope: "adatbazis" | "kijelolt" | "szurt";
  /** Hány sor felelne meg összesen (a darabszám-korlát előtt). */
  candidates: number;
  /** Egyszerre hány cégen dolgozunk. */
  concurrency: number;
  /** Amin épp dolgozunk — a felület ezeket mutatja töltés-jelzéssel. */
  active: { company: string; startedAt: string }[];
  recent: SweepItem[];
}

export interface SweepOptions {
  provider: SearchProvider;
  /** 0 = az összes találat. Csak `ids` nélkül számít. */
  limit: number;
  /** Hagyja ki azokat, amiknél már futott keresés. Csak `ids` nélkül számít. */
  skipSearched: boolean;
  /** Szünet két cég között, hogy ne fussunk limitbe. */
  delayMs: number;
  /**
   * Egyszerre hány cégen dolgozzon. Mindig ennyi fut: ha egy végez, azonnal
   * indul a következő. Fölötte a CLI-sor is enged annyit (cliQueue).
   */
  concurrency?: number;
  /** Konkrét sorok — ilyenkor nem az adatbázist pásztázzuk, hanem ezeket. */
  ids?: string[];
  /** A felületen beállított szűrő — ilyenkor csak azon a halmazon megyünk végig. */
  filters?: ContactFilters;
}

const state: SweepState = {
  status: "idle",
  provider: "claude",
  total: 0,
  processed: 0,
  found: 0,
  filled: 0,
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

export function sweepState(): SweepState {
  return { ...state, active: [...state.active], recent: [...state.recent] };
}

export function stopSweep(): SweepState {
  if (state.status === "running") {
    stopRequested = true;
    state.status = "stopping";
    state.message = "Leállítás kérve — az épp futó cég még befejeződik.";
    log.warn("leállítás kérve");
  }
  return sweepState();
}

/** Van-e értelmes szűrő a kérésben (a rendezés nem szűkít). */
function hasFilters(filters?: ContactFilters): boolean {
  if (!filters) return false;
  return Object.entries(filters).some(
    ([key, value]) => Boolean(value) && key !== "sort",
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Egyetlen cég feldolgozása: keresés → mentés → esetleg cím beírása. */
async function processOne(
  contact: ContactDoc,
  provider: SearchProvider,
  position: string,
): Promise<SweepItem> {
  const started = Date.now();
  log.info(`${position} · ${contact.company} — keresés indul`, {
    website: contact.website,
    orszag: contact.country,
  });

  try {
    const finding = await findEmail(contact, provider, "sweep");
    const ms = Date.now() - started;

    await saveEmailSearch(contact._id, {
      at: new Date().toISOString(),
      result: finding.email ? "found" : "none",
      email: finding.email,
      confidence: finding.confidence,
      source: finding.source,
      applyUrl: finding.applyUrl,
      alternatives: finding.alternatives,
      notes: finding.notes,
      citations: finding.citations,
      model: finding.model,
      usage: finding.usage
        ? {
            provider: finding.usage.provider,
            model: finding.usage.model,
            totalTokens: finding.usage.totalTokens,
            inputTokens: finding.usage.inputTokens,
            outputTokens: finding.usage.outputTokens,
            cacheReadTokens: finding.usage.cacheReadTokens,
            costUsd: finding.usage.costUsd,
            ms: finding.usage.ms,
            turns: finding.usage.turns,
          }
        : null,
    });

    // Csak forrással alátámasztott címet írunk be, és csak üres sorba.
    const fill =
      Boolean(finding.email) &&
      !contact.primaryEmail &&
      finding.confidence !== "low";

    if (fill && finding.email) {
      await updateContact(
        contact._id,
        {
          primaryEmail: finding.email,
          tags: [
            ...new Set([
              ...contact.tags.filter((tag) => tag !== "nincs-email"),
              "van-email",
              "kutatott-email",
            ]),
          ],
          note: finding.source
            ? [contact.note, `e-mail forrása: ${finding.source}`]
                .filter(Boolean)
                .join(" · ")
            : contact.note,
        },
        "e-mail keresés",
      );
    }

    log.info(
      `${position} · ${contact.company} → ${finding.email ?? "nincs cím"}` +
        `${fill ? " (beírva)" : finding.email ? " (csak javaslat)" : ""}`,
      {
        confidence: finding.confidence,
        source: finding.source,
        alternativak: finding.alternatives.length,
        ms,
      },
    );

    return {
      company: contact.company,
      email: finding.email,
      confidence: finding.confidence,
      filled: fill,
      ms,
    };
  } catch (error) {
    const message = (error as Error).message;
    log.error(`${position} · ${contact.company} — hiba: ${message}`);
    return {
      company: contact.company,
      email: null,
      confidence: "low",
      filled: false,
      ms: Date.now() - started,
      error: message,
    };
  }
}

/** Csak az azonosítókat töltjük be — a teljes dokumentumokat egyesével kérjük le. */
async function loadQueue(options: SweepOptions): Promise<string[]> {
  if (options.ids?.length) {
    state.candidates = options.ids.length;
    return options.ids;
  }

  // A képernyőn beállított szűrő + "nincs e-mail" (és opcionálisan "még nem
  // kerestem"). Így pontosan azon a halmazon megy végig, amit a listában látsz.
  const filters: ContactFilters = {
    ...(options.filters ?? {}),
    hasEmail: "no",
    ...(options.skipSearched ? { emailSearched: "no" as const } : {}),
    sort: "company",
  };

  state.candidates = await countContacts(filters);
  return listContactIds(filters, options.limit > 0 ? options.limit : 0);
}

async function run(options: SweepOptions): Promise<void> {
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
      : "Nincs feldolgozandó cég — mindegyiknél van cím vagy már kerestünk.";
    log.info("nincs mit keresni");
    return;
  }

  let consecutiveErrors = 0;
  let cursor = 0;
  // Ennyi cégen dolgozunk egyszerre; ha egy végez, a következőt viszi tovább
  // ugyanaz a munkás — így mindig `concurrency` darab fut.
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
      const position = `${index + 1}/${queue.length}`;
      const item = await processOne(contact, options.provider, position);
      working.delete(contact.company);
      showCurrent();

      state.processed += 1;
      if (item.error) {
        state.failed += 1;
        consecutiveErrors += 1;
      } else {
        consecutiveErrors = 0;
        if (item.email) state.found += 1;
        if (item.filled) state.filled += 1;
      }

      state.recent.unshift(item);
      if (state.recent.length > 50) state.recent.pop();

      // Az eddigi átlagból becslünk — a párhuzamosság benne van, mert ez
      // eltelt időt oszt a kész darabszámmal.
      const elapsed =
        Date.now() - new Date(state.startedAt ?? Date.now()).getTime();
      const perItem = elapsed / state.processed;
      state.etaSeconds = Math.round(
        ((queue.length - state.processed) * perItem) / 1000,
      );

      if (options.delayMs > 0 && cursor < queue.length) {
        // A szünet nem csak udvariasság: ennyi idő alatt a kilépő CLI memóriája
        // is felszabadul, mielőtt a következő elindulna.
        await sleep(options.delayMs);
      }
    }
  };

  log.info(`${concurrency} szálon dolgozunk`, { sor: cliBusy().limit });
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (consecutiveErrors >= 3) {
    state.message =
      "Három egymás utáni hiba után leálltam (limit vagy hálózati gond lehet).";
    log.error(state.message);
  } else if (stopRequested) {
    state.message = `Leállítva ${state.processed}/${state.total} után.`;
    log.warn(state.message);
  }

  state.current = null;
  state.active = [];
  state.finishedAt = new Date().toISOString();
  state.status = stopRequested ? "idle" : "done";
  log.info(
    `vége: ${state.processed}/${state.total} feldolgozva, ${state.found} cím, ` +
      `${state.filled} beírva, ${state.failed} hiba`,
  );
}

export function startSweep(options: SweepOptions): SweepState {
  if (state.status === "running" || state.status === "stopping") {
    return sweepState();
  }

  stopRequested = false;
  // A CLI-sor is engedjen annyit, amennyin dolgozni akarunk.
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 1));
  const previousLimit = cliConcurrency();
  setCliConcurrency(Math.max(previousLimit, concurrency));

  Object.assign(state, {
    status: "running",
    provider: options.provider,
    concurrency,
    scope: options.ids?.length
      ? "kijelolt"
      : hasFilters(options.filters)
        ? "szurt"
        : "adatbazis",
    candidates: 0,
    total: 0,
    processed: 0,
    found: 0,
    filled: 0,
    failed: 0,
    current: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    etaSeconds: null,
    message: null,
    active: [],
    recent: [],
  } satisfies Partial<SweepState>);

  // Szándékosan nem várjuk meg: a kérés visszatér, a futás megy tovább.
  running = run(options)
    .catch((error: Error) => {
      state.status = "error";
      state.message = error.message;
      state.current = null;
      log.error("a futás elszállt", error.message);
    })
    .finally(() => {
      running = null;
      // Egy kézi keresés ne fusson tovább megemelt kerettel.
      setCliConcurrency(previousLimit);
    });

  return sweepState();
}

/** Teszthez / leállításhoz: megvárja a futó menetet, ha van. */
export function sweepPromise(): Promise<void> | null {
  return running;
}
