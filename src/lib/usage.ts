/**
 * Token-felhasználás mérése keresésenként.
 *
 * Enélkül vakon optimalizálnánk: a Claude CLI alapból Opusszal futott, körönként
 * újraküldte a teljes beszélgetést, és egyetlen cég 226 ezer input tokent vitt el.
 * Most minden keresés lezárásakor eltesszük, mi mennyibe került — a `/usage`
 * oldal ebből számol, és a keresés a saját során is ott marad.
 */
import type { Collection } from "mongodb";
import { createLogger } from "./logger";
import { getDb } from "./mongodb";
import { formatNumber } from "./format";

const log = createLogger("usage");

/** Amit egy keresésről tudunk. Minden mező opcionális: nem minden motor ad meg mindent. */
export interface SearchUsage {
  /** `scrape` = modell nélküli letöltés + regex, nulla tokenből. */
  provider: "openai" | "claude" | "codex" | "scrape";
  model: string;
  /** Friss (nem cache-elt) bemenet. */
  inputTokens: number;
  outputTokens: number;
  /** Prompt-cache: az írás drágább, az olvasás olcsóbb, de mindkettő fogy. */
  cacheWriteTokens: number;
  cacheReadTokens: number;
  /** A négy bemeneti fajta összege + kimenet. Ez a „mennyi fogyott" szám. */
  totalTokens: number;
  /** Amit a CLI/API mond; előfizetésen ez nem számla, hanem viszonyítás. */
  costUsd: number | null;
  ms: number;
  /** Hány asszisztens-kör és hány eszközhívás kellett hozzá. */
  turns: number | null;
  webSearch: number | null;
  webFetch: number | null;
}

export interface UsageEntry extends SearchUsage {
  at: string;
  contactId: string | null;
  company: string;
  /** Lett-e cím a végén — így látszik, mibe kerül egy *sikeres* találat. */
  found: boolean;
  /** Honnan indult: egyedi keresés, sweep, névből felvétel. */
  origin: string;
}

let ready: Promise<void> | null = null;

async function usageCollection(): Promise<Collection<UsageEntry>> {
  const db = await getDb();
  const collection = db.collection<UsageEntry>("usage");

  ready ??= (async () => {
    await Promise.all([
      collection.createIndex({ at: -1 }),
      collection.createIndex({ provider: 1, at: -1 }),
      collection.createIndex({ contactId: 1 }),
    ]);
  })().catch(() => {
    ready = null;
  });
  await ready;

  return collection;
}

/** Egy keresés elszámolása. Sosem dobhat hibát: a mérés nem buktathatja a keresést. */
export async function recordUsage(entry: UsageEntry): Promise<void> {
  try {
    const collection = await usageCollection();
    await collection.insertOne(entry);
    log.info(
      `${entry.company}: ${formatNumber(entry.totalTokens)} token ` +
        `(${entry.provider}/${entry.model})`,
      {
        input: entry.inputTokens,
        cacheRead: entry.cacheReadTokens,
        cacheWrite: entry.cacheWriteTokens,
        output: entry.outputTokens,
        korok: entry.turns,
        usd: entry.costUsd,
        ms: entry.ms,
      },
    );
  } catch (error) {
    log.warn(`a mérés mentése nem sikerült: ${(error as Error).message}`);
  }
}

export interface UsageBucket {
  key: string;
  searches: number;
  found: number;
  tokens: number;
  costUsd: number;
  ms: number;
}

export interface UsageSummary {
  days: number;
  /** A ténylegesen lekérdezett időszak — az export ugyanezt kapja. */
  from: string;
  to: string;
  totals: UsageBucket;
  /** Motor + modell szerinti bontás — ebből látszik, melyik mennyibe kerül. */
  byModel: UsageBucket[];
  byDay: UsageBucket[];
  byOrigin: UsageBucket[];
  recent: UsageEntry[];
}

function emptyBucket(key: string): UsageBucket {
  return { key, searches: 0, found: 0, tokens: 0, costUsd: 0, ms: 0 };
}

function add(bucket: UsageBucket, entry: UsageEntry): void {
  bucket.searches += 1;
  if (entry.found) bucket.found += 1;
  bucket.tokens += entry.totalTokens;
  bucket.costUsd += entry.costUsd ?? 0;
  bucket.ms += entry.ms;
}

export interface UsageRange {
  /** ÉÉÉÉ-HH-NN — a nap elejétől. */
  from?: string;
  /** ÉÉÉÉ-HH-NN — a nap **végéig**, az adott napot is beleértve. */
  to?: string;
  /** Ha nincs from/to: ennyi napra visszamenőleg. */
  days?: number;
  recentLimit?: number;
}

/** A kért időszak ISO-határai. Egy nap exportjához from = to. */
function bounds(range: UsageRange): { fromIso: string; toIso: string; days: number } {
  const days = Math.max(1, Math.min(365, range.days ?? 30));

  const start = range.from
    ? new Date(`${range.from}T00:00:00`)
    : new Date(Date.now() - (days - 1) * 86_400_000);
  start.setHours(0, 0, 0, 0);

  const end = range.to ? new Date(`${range.to}T00:00:00`) : new Date();
  end.setHours(23, 59, 59, 999);

  return {
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
    days: Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000)),
  };
}

/** Egy időszak összes tétele — az exporthoz, darabszám-korlát nélkül. */
export async function listUsage(range: UsageRange = {}): Promise<UsageEntry[]> {
  const collection = await usageCollection();
  const { fromIso, toIso } = bounds(range);
  return collection
    .find({ at: { $gte: fromIso, $lte: toIso } }, { projection: { _id: 0 } })
    .sort({ at: -1 })
    .toArray();
}

/**
 * Összesítés a `/usage` oldalnak.
 *
 * Az összegzés itt, memóriában megy: a keresések száma nagyságrenddel kisebb,
 * mint a kontaktoké (napi néhány száz), és így egyetlen lekérdezés elég.
 */
export async function usageSummary(range: UsageRange = {}): Promise<UsageSummary> {
  const collection = await usageCollection();
  const { fromIso, toIso, days } = bounds(range);
  const recentLimit = range.recentLimit ?? 50;

  const rows = await collection
    .find({ at: { $gte: fromIso, $lte: toIso } }, { projection: { _id: 0 } })
    .sort({ at: -1 })
    .toArray();

  const totals = emptyBucket("összes");
  const byModel = new Map<string, UsageBucket>();
  const byDay = new Map<string, UsageBucket>();
  const byOrigin = new Map<string, UsageBucket>();

  for (const entry of rows) {
    add(totals, entry);

    const modelKey = `${entry.provider} · ${entry.model}`;
    byModel.set(modelKey, byModel.get(modelKey) ?? emptyBucket(modelKey));
    add(byModel.get(modelKey)!, entry);

    const day = entry.at.slice(0, 10);
    byDay.set(day, byDay.get(day) ?? emptyBucket(day));
    add(byDay.get(day)!, entry);

    const origin = entry.origin || "ismeretlen";
    byOrigin.set(origin, byOrigin.get(origin) ?? emptyBucket(origin));
    add(byOrigin.get(origin)!, entry);
  }

  return {
    days,
    from: fromIso.slice(0, 10),
    to: toIso.slice(0, 10),
    totals,
    byModel: [...byModel.values()].sort((a, b) => b.tokens - a.tokens),
    byDay: [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key)),
    byOrigin: [...byOrigin.values()].sort((a, b) => b.tokens - a.tokens),
    recent: rows.slice(0, recentLimit),
  };
}
