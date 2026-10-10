/**
 * Napi queue-statisztika (`queue_daily_stats`): tartós nyom arról, ami az élő
 * állapotból eltűnne — a hibás küldések és a kutatás (begyűjtés) állása.
 * A telefonos widget ebből olvas (`widgetQueuesData.ts`).
 *
 * Az írás sosem állíthatja meg a küldést vagy a keresést: minden hibát
 * lenyelünk és naplózunk.
 */
import type { Collection } from "mongodb";
import { createLogger } from "./logger";
import { getDb } from "./mongodb";
import { dayKey } from "./queuePlan";

const log = createLogger("queue-stat");

export interface QueueDailyStats {
  /** `smtp:<fiók>` · `research:email` · `research:people`. */
  queueId: string;
  /** `ÉÉÉÉ-HH-NN`, budapesti naptár szerint. */
  date: string;
  total: number;
  done: number;
  failed: number;
  /** Épp feldolgozás alatt álló darab (kutatásnál a párhuzamos szálak). */
  inProgress?: number;
  /** A feldolgozó most dolgozik ezen a soron. */
  running?: boolean;
  /** Az utolsó futás hibával állt meg — ez az üzenete. */
  lastError?: string | null;
  completedAt: string | null;
  updatedAt: string;
}

let ready: Promise<void> | null = null;

export async function queueStats(): Promise<Collection<QueueDailyStats>> {
  const collection = (await getDb()).collection<QueueDailyStats>(
    "queue_daily_stats",
  );
  ready ??= collection
    .createIndex({ queueId: 1, date: 1 }, { unique: true })
    .then(() => undefined)
    .catch(() => {
      ready = null;
    });
  await ready;
  return collection;
}

type Counters = Partial<
  Pick<QueueDailyStats, "total" | "done" | "failed" | "inProgress">
>;
type Fields = Partial<
  Pick<QueueDailyStats, "running" | "lastError" | "completedAt" | "inProgress">
>;

/**
 * Az írások sorban mennek ki: a hívók nem várnak rájuk, de egy „indult” ne
 * érkezhessen meg az utána következő darab számlálása után.
 */
let chain: Promise<void> = Promise.resolve();

function bump(queueId: string, inc: Counters, set: Fields = {}): void {
  chain = chain.then(() => write(queueId, inc, set));
}

/** Atomi növelés a mai nap sorában; ha még nincs sor, létrejön. */
async function write(
  queueId: string,
  inc: Counters,
  set: Fields = {},
): Promise<void> {
  try {
    const now = new Date();
    const zero = { total: 0, done: 0, failed: 0, completedAt: null };
    const insert = Object.fromEntries(
      Object.entries(zero).filter(([key]) => !(key in inc) && !(key in set)),
    );
    await (
      await queueStats()
    ).updateOne(
      { queueId, date: dayKey(now) },
      {
        ...(Object.keys(inc).length ? { $inc: inc } : {}),
        $set: { ...set, updatedAt: now.toISOString() },
        $setOnInsert: insert,
      },
      { upsert: true },
    );
  } catch (error) {
    log.warn(`statisztika írása nem sikerült: ${(error as Error).message}`);
  }
}

/** Egy levél véglegesen nem ment ki ebből a fiókból. */
export function recordSendFailure(accountId: string): void {
  bump(`smtp:${accountId}`, { failed: 1 });
}

export interface SweepTracker {
  /** A sor összeállt: ennyi cégen megyünk végig. */
  started(total: number): void;
  itemStarted(): void;
  itemFinished(failed: boolean): void;
  /**
   * A futás véget ért. `unprocessed`: ennyi cég maradt ki (leállítás); `error`:
   * hibával állt meg — ilyenkor a maradék hátralékban marad.
   */
  finished(result: { unprocessed: number; error: string | null }): void;
}

/** A begyűjtés (kutatás) állásának követése — a hívó nem vár rá. */
export function sweepTracker(queueId: string): SweepTracker {
  return {
    started: (total) =>
      bump(
        queueId,
        { total },
        { running: true, inProgress: 0, lastError: null, completedAt: null },
      ),
    itemStarted: () => bump(queueId, { inProgress: 1 }),
    itemFinished: (failed) =>
      bump(queueId, {
        inProgress: -1,
        ...(failed ? { failed: 1 } : { done: 1 }),
      }),
    finished: ({ unprocessed, error }) =>
      bump(queueId, error ? {} : { total: -unprocessed }, {
        running: false,
        lastError: error,
        completedAt: error ? null : new Date().toISOString(),
      }),
  };
}
