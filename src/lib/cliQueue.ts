/**
 * Közös futtatási sor a helyi AI CLI-khez (Claude Code, Codex).
 *
 * Egy-egy példány 400-700 MB memóriát eszik, ezért korlátozott számban futnak
 * — mindegy, hogy kézi keresésből, tömeges keresésből vagy az automata
 * begyűjtésből indultak. Alapból egy (`CLI_CONCURRENCY`), a begyűjtés viszont
 * feljebb állíthatja (a felületen: „egyszerre N szálon”). Enélkül egy 16 GB-os
 * gép is swapbe megy, és használhatatlanná fagy.
 */
import { accessSync, constants } from "node:fs";
import { freemem } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import { credential } from "./env";
import { createLogger } from "./logger";

const log = createLogger("cli-queue");

/** Egyszerre futó CLI-folyamatok száma. 1-8 között állítható. */
const MAX_SLOTS = 8;
const shared = globalThis as typeof globalThis & {
  __melodiaCli?: {
    limit: number;
    /** Lefoglalt férőhelyek — ez korlátoz (a halmaz csak kiírásra való). */
    reserved: number;
    active: Set<string>;
    waiting: (() => void)[];
    queued: number;
  };
};
const q = (shared.__melodiaCli ??= {
  limit: Math.min(
    MAX_SLOTS,
    Math.max(1, Number(credential("CLI_CONCURRENCY", "1")) || 1),
  ),
  reserved: 0,
  active: new Set<string>(),
  waiting: [] as (() => void)[],
  queued: 0,
});

export function cliBusy(): {
  running: string | null;
  queued: number;
  limit: number;
} {
  return {
    running: q.active.size ? [...q.active].join(" · ") : null,
    queued: q.queued,
    limit: q.limit,
  };
}

export function cliConcurrency(): number {
  return q.limit;
}

/**
 * Hány CLI fusson egyszerre. A begyűjtés indításkor állítja, és a végén
 * visszaveszi az alapértékre. Emeléskor a várakozókat azonnal elindítjuk.
 */
export function setCliConcurrency(value: number): number {
  q.limit = Math.min(MAX_SLOTS, Math.max(1, Math.round(value) || 1));
  drain();
  return q.limit;
}

/** A felszabadult férőhelyeket azonnal kiosztjuk a várakozóknak. */
function drain(): void {
  while (q.waiting.length && q.reserved < q.limit) {
    q.reserved += 1;
    q.waiting.shift()?.();
  }
}

/** Férőhely foglalása — visszatéréskor a foglalás már megtörtént. */
function acquire(): Promise<void> {
  if (q.reserved < q.limit) {
    q.reserved += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    q.waiting.push(resolve);
  });
}

/** Szabad memória MB-ban — indítás előtt megnézzük, van-e hova. */
export function freeMemoryMb(): number {
  return Math.round(freemem() / (1024 * 1024));
}

/**
 * macOS-en a "szabad" memória félrevezetően alacsony (az inaktív lapok
 * újrahasznosíthatók), ezért ez csak vészfék: nagyon alacsony értéknél várunk
 * pár kört, de nem hiúsítjuk meg a keresést.
 */
async function waitForMemory(): Promise<void> {
  const minFree = Number(credential("CLAUDE_MIN_FREE_MB", "250"));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const free = freeMemoryMb();
    if (free >= minFree) return;
    log.warn(`kevés a szabad memória (${free} MB) — várok 8 mp-et`);
    await new Promise((resolve) => setTimeout(resolve, 8_000));
  }
}

/**
 * Megvan-e a futtatható állomány? Abszolút útvonalnál a fájlrendszert nézzük,
 * puszta névnél a PATH-t. Azért kell előre tudni, mert `nice`-on keresztül
 * indítunk, és akkor a hiányzó bináris nem ENOENT-ként jönne vissza.
 */
export function findExecutable(name: string): string | null {
  const usable = (path: string) => {
    try {
      accessSync(path, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };

  if (name.includes("/")) {
    return isAbsolute(name) && usable(name) ? name : null;
  }
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (usable(candidate)) return candidate;
  }
  return null;
}

/**
 * Beállítja a feladatot a sorba, és megvárja, míg felszabadul egy férőhely.
 * A visszaadott ígéret a saját eredményét adja; a hiba nem akasztja meg a sort.
 */
export async function runExclusive<T>(
  name: string,
  task: () => Promise<T>,
): Promise<T> {
  q.queued += 1;
  const slot = `${name}#${q.queued}`;
  if (q.reserved >= q.limit) {
    log.info(
      `${name} sorban áll (${q.reserved}/${q.limit} fut, ${q.waiting.length + 1} vár)`,
    );
  }
  await acquire();

  await waitForMemory();
  q.active.add(slot);
  try {
    return await task();
  } finally {
    q.active.delete(slot);
    q.queued -= 1;
    q.reserved -= 1;
    drain();
  }
}
