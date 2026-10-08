/**
 * Perzisztens hívásszámláló a véges keretű forrásokhoz.
 *
 * A Jooble kerete 500 hívás a kulcs TELJES ÉLETTARTAMÁRA — nem havonta
 * töltődik. Egy memóriabeli számláló itt semmit nem érne: újraindításkor
 * nullázódna, a telepített példány és a helyi szerver pedig külön számolna.
 * Ezért a számlálók a Mongóban élnek (`app_state`, `_id: "jobs_quota"`),
 * egyetlen kis dokumentumban.
 *
 * Két szint:
 *   • FIGYELMEZTETÉS — a napló jelzi, hogy fogy a keret
 *   • HARD STOP — a forrás megtagadja a hívást, mielőtt elfogyna
 *
 * A hard stop szándékosan a keret ALATT van: marad tartalék kézi
 * ellenőrzésre, hibakeresésre, egyszeri célzott lekérdezésre.
 */
import type { Collection } from "mongodb";
import { createLogger } from "../logger";
import { getDb } from "../mongodb";

const log = createLogger("jobs");

const DOC_ID = "jobs_quota";

export interface QuotaConfig {
  /** A teljes keret (Jooble: 500 élethosszig). */
  limit: number;
  /** Efölött figyelmeztetünk. */
  warnAt: number;
  /** Ennél a hívásszámnál megtagadjuk a további hívásokat. */
  stopAt: number;
}

export interface QuotaState {
  used: number;
  firstCallAt?: string;
  lastCallAt?: string;
}

/** Ablak-azonosító → hívásszám. Forrásonként és ablakonként egy ilyen. */
interface WindowState {
  [bucket: string]: number;
}

interface QuotaDoc {
  _id: string;
  lifetime?: Record<string, QuotaState>;
  windows?: Record<string, Record<string, WindowState>>;
}

async function collection(): Promise<Collection<QuotaDoc>> {
  return (await getDb()).collection<QuotaDoc>("app_state");
}

async function readDoc(): Promise<QuotaDoc> {
  return (
    (await (await collection()).findOne({ _id: DOC_ID })) ?? { _id: DOC_ID }
  );
}

export async function quotaState(id: string): Promise<QuotaState> {
  return (await readDoc()).lifetime?.[id] ?? { used: 0 };
}

/** Elértük-e a hard stopot. Hívás ELŐTT kell megkérdezni. */
export async function quotaExhausted(
  id: string,
  cfg: QuotaConfig,
): Promise<boolean> {
  return (await quotaState(id)).used >= cfg.stopAt;
}

/**
 * Egy elhasznált hívás rögzítése. A hívás UTÁN hívd, sikertől függetlenül —
 * a keretet a szerver akkor is levonja, ha a válasz hibás volt.
 */
export async function recordCall(id: string, cfg: QuotaConfig): Promise<void> {
  const now = new Date().toISOString();
  // A növelés atomi: két példány egyszerre futó hívása sem vész el.
  const doc = await (
    await collection()
  ).findOneAndUpdate(
    { _id: DOC_ID },
    {
      $inc: { [`lifetime.${id}.used`]: 1 },
      $set: { [`lifetime.${id}.lastCallAt`]: now },
    },
    { upsert: true, returnDocument: "after" },
  );
  const used = doc?.lifetime?.[id]?.used ?? 1;
  if (!doc?.lifetime?.[id]?.firstCallAt) {
    await (
      await collection()
    ).updateOne(
      { _id: DOC_ID },
      { $set: { [`lifetime.${id}.firstCallAt`]: now } },
    );
  }

  if (used === cfg.warnAt) {
    log.warn(
      `a(z) "${id}" forrás elérte a ${cfg.warnAt} hívást a ${cfg.limit}-es keretből — a hard stop ${cfg.stopAt}-nél van`,
    );
  }
  if (used >= cfg.stopAt) {
    log.error(
      `a(z) "${id}" forrás elérte a hard stopot (${used}/${cfg.limit}) — további hívás nem megy ki, új kulcs kell`,
    );
  }
}

/* ------------------------------------------------------- ablakos kvóták */

/**
 * Időablakos keretek (Adzuna: 25/perc, 250/nap, 1000/hét, 2500/hó).
 *
 * Az élethosszig szóló számlálótól (Jooble) abban tér el, hogy a keret
 * MEGÚJUL. Ezért nem egy számlálót vezetünk, hanem ablakonként egyet, és a
 * lejárt ablakokat kitakarítjuk — különben a dokumentum korlátlanul nőne.
 */
export interface WindowLimits {
  perMinute?: number;
  perDay?: number;
  perWeek?: number;
  perMonth?: number;
}

type WindowName = "minute" | "day" | "week" | "month";

/** Az adott pillanathoz tartozó ablak-azonosító. */
export function windowKey(name: WindowName, at = new Date()): string {
  const iso = at.toISOString();
  switch (name) {
    case "minute":
      return iso.slice(0, 16); // 2026-09-01T12:34
    case "day":
      return iso.slice(0, 10); // 2026-09-01
    case "month":
      return iso.slice(0, 7); // 2026-09
    case "week": {
      // ISO-hét: az év első csütörtökéhez igazítva.
      const d = new Date(
        Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
      );
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil(
        ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
      );
      return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
    }
  }
}

const WINDOWS: [WindowName, keyof WindowLimits][] = [
  ["minute", "perMinute"],
  ["day", "perDay"],
  ["week", "perWeek"],
  ["month", "perMonth"],
];

/** Hány hívás fért el eddig az aktuális ablakokban. */
export async function windowUsage(
  id: string,
  at = new Date(),
): Promise<Record<WindowName, number>> {
  const states = (await readDoc()).windows?.[id] ?? {};
  const out = {} as Record<WindowName, number>;
  for (const [name] of WINDOWS) {
    out[name] = states[name]?.[windowKey(name, at)] ?? 0;
  }
  return out;
}

/**
 * Melyik ablak telt be, ha bármelyik.
 * @returns a betelt ablak neve, vagy null, ha mehet a hívás.
 */
export async function windowBlocked(
  id: string,
  limits: WindowLimits,
  at = new Date(),
): Promise<WindowName | null> {
  const used = await windowUsage(id, at);
  for (const [name, limitKey] of WINDOWS) {
    const limit = limits[limitKey];
    if (limit != null && used[name] >= limit) return name;
  }
  return null;
}

/** Egy elhasznált hívás rögzítése minden korlátozott ablakban. */
export async function recordWindowedCall(
  id: string,
  limits: WindowLimits,
  at = new Date(),
): Promise<void> {
  const current: Record<string, string> = {};
  const increments: Record<string, number> = {};
  for (const [name, limitKey] of WINDOWS) {
    if (limits[limitKey] == null) continue;
    current[name] = windowKey(name, at);
    increments[`windows.${id}.${name}.${current[name]}`] = 1;
  }
  // A növelés atomi: két egyszerre futó keresés hívásai sem vesznek el.
  const doc = await (
    await collection()
  ).findOneAndUpdate(
    { _id: DOC_ID },
    { $inc: increments },
    { upsert: true, returnDocument: "after" },
  );

  // A lejárt ablakok takarítása — enélkül a dokumentum korlátlanul nőne.
  const stale: Record<string, ""> = {};
  for (const [name, buckets] of Object.entries(doc?.windows?.[id] ?? {})) {
    for (const bucket of Object.keys(buckets)) {
      if (bucket !== current[name])
        stale[`windows.${id}.${name}.${bucket}`] = "";
    }
  }
  if (Object.keys(stale).length) {
    await (await collection()).updateOne({ _id: DOC_ID }, { $unset: stale });
  }
}
