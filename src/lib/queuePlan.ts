/**
 * Előrejelzés: melyik napon melyik fiók hány levelet tud kiküldeni egy
 * queue-ból. Ebből épül a naptár, és ez osztja szét a címzetteket a fiókok
 * között indításkor.
 *
 * Tiszta modul (adatbázis nélkül) — a számok becslések: a munkaidő-ablakot a
 * feladó naptárával közelíti, a címzettek időzónáját nem ismeri.
 */
import type { MailProvider } from "./accountStore";
import { warmupCap } from "./warmup";

/** A queue-ból indított menetek munkaidő-ablaka (a címzett helyi idejében). */
export const QUEUE_WINDOW_FROM = 7;
export const QUEUE_WINDOW_TO = 19;

const ZONE = "Europe/Budapest";
const DAY_MS = 86_400_000;

export interface PlanAccount {
  id: string;
  provider: MailProvider;
  /** A queue-ban ehhez a fiókhoz beállított napi keret. */
  dailyLimit: number;
  /** A fiók első küldése (felfuttatás kezdete), vagy `null`, ha még nem küldött. */
  firstSendAt: string | null;
  /** Hamis: a fiókon a felfuttatás ki van kapcsolva. */
  warmup: boolean;
  /** A fiók saját napi maximuma kikapcsolt felfuttatásnál, vagy `null`. */
  dailyMax: number | null;
}

export interface QueuePlan {
  /** fiók → nap → darab */
  cells: Map<string, Map<string, number>>;
  /** fiók → összesen */
  totals: Map<string, number>;
  /** Ami a vizsgált napokba nem fért bele. */
  leftover: number;
  /** Melyik napon fogy el a queue, vagy `null`, ha a vizsgált időn túl. */
  finishDay: string | null;
}

/** `ÉÉÉÉ-HH-NN` a feladó naptára szerint. */
export function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(date);
}

/** A nap dele UTC-ben: ugyanarra a naptári napra esik, és a hét napja is kiolvasható. */
function noon(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

/** `count` egymást követő nap kulcsa, `from`-tól (lehet negatív eltolás is). */
export function dayKeys(from: Date, offset: number, count: number): string[] {
  const start = noon(dayKey(from)).getTime() + offset * DAY_MS;
  return Array.from({ length: count }, (_, index) =>
    dayKey(new Date(start + index * DAY_MS)),
  );
}

export function isWeekend(key: string): boolean {
  const weekday = noon(key).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/**
 * Ennyi levél fér egy napba pusztán az idő miatt: a munkaidő-ablak hossza
 * osztva az átlagos szünettel. 10–20 perces szünettel ez napi ~49 — hiába
 * engedne a keret 100-at.
 */
export function throughputCap(minMinutes: number, maxMinutes: number): number {
  const average = Math.max(1, (minMinutes + maxMinutes) / 2);
  return Math.floor(((QUEUE_WINDOW_TO - QUEUE_WINDOW_FROM) * 60) / average) + 1;
}

/**
 * Ennyi levél fér még ki MA, a küldési ablak végéig (a feladó órája szerint).
 * Az ablak előtt a teljes nap, az ablak után nulla.
 */
export function remainingToday(
  now: Date,
  minMinutes: number,
  maxMinutes: number,
): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const minute = value("hour") * 60 + value("minute");
  const left = QUEUE_WINDOW_TO * 60 - Math.max(minute, QUEUE_WINDOW_FROM * 60);
  if (left <= 0) return 0;
  const average = Math.max(1, (minMinutes + maxMinutes) / 2);
  return Math.floor(left / average) + 1;
}

/**
 * Napról napra kiosztja a hátralévő címzetteket a fiókok között.
 *
 * A `used` (fiók → nap → darab) a már foglalt keret: a ma kiment levelek és a
 * korábban tervezett queue-k. A függvény hozzáírja a sajátját, így több queue
 * egymás után tervezhető ugyanarra a fiókra.
 */
export function planQueue(
  input: {
    remaining: number;
    accounts: PlanAccount[];
    minMinutes: number;
    maxMinutes: number;
    /** A mai napon már csak ennyi fér ki (a nap hátralévő részébe). */
    today?: { day: string; cap: number };
    /** Igaz: a queue hétvégén is küld, a hétvégi napok is tervezhetők. */
    weekends?: boolean;
  },
  days: string[],
  used: Map<string, Map<string, number>>,
): QueuePlan {
  const cells = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  const fullDay = throughputCap(input.minMinutes, input.maxMinutes);
  // Aki még nem küldött, annak a felfuttatása az első tervezett napján indul.
  const firstSend = new Map(
    input.accounts.map((account) => [account.id, account.firstSendAt]),
  );

  let remaining = Math.max(0, input.remaining);
  let finishDay: string | null = null;

  for (const day of days) {
    if (!remaining) break;
    if (isWeekend(day) && !input.weekends) continue;
    const date = noon(day);
    const perDay =
      input.today?.day === day ? Math.min(fullDay, input.today.cap) : fullDay;

    for (const account of input.accounts) {
      if (!remaining) break;
      const started = firstSend.get(account.id) ?? date.toISOString();
      // Vagy a felfuttatás korlátoz, vagy a fiók saját maximuma — egyszerre egy.
      const warmup = account.warmup
        ? warmupCap(started, account.provider, date)
        : account.dailyMax;
      const taken = used.get(account.id)?.get(day) ?? 0;
      const room =
        Math.min(account.dailyLimit, warmup ?? Infinity, perDay) - taken;
      const take = Math.min(remaining, Math.max(0, room));
      if (!take) continue;

      firstSend.set(account.id, started);
      remaining -= take;
      totals.set(account.id, (totals.get(account.id) ?? 0) + take);
      if (!cells.has(account.id)) cells.set(account.id, new Map());
      cells.get(account.id)!.set(day, take);
      if (!used.has(account.id)) used.set(account.id, new Map());
      used.get(account.id)!.set(day, taken + take);
    }
    if (!remaining) finishDay = day;
  }

  return { cells, totals, leftover: remaining, finishDay };
}
