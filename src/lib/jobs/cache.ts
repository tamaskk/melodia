/**
 * Egyszerű memóriabeli TTL-cache.
 *
 * MVP-szint: folyamatonként él, szerver-újraindításkor üres, és több példány
 * esetén példányonként külön. A szerveroldali, megosztott cache a ClickUp
 * 38-as taskja — ez az interfész úgy készült, hogy oda átemelhető legyen.
 *
 * A TTL forrásonként a `SourceMeta.cacheTtlMinutes`-ből jön: a Jobicy 60 perc,
 * mert naponta többször frissül, a Greenhouse 720, mert nem.
 */

interface Entry<T> {
  value: T;
  /** Mikor jár le (epoch ms). */
  expiresAt: number;
  /** A forrás saját frissítési bélyege, ha ad ilyet (Jobicy: lastUpdate). */
  stamp?: string;
}

const store = new Map<string, Entry<unknown>>();

export function getCached<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return e.value as T;
}

/** A tárolt bélyeg akkor is kiolvasható, ha a bejegyzés már lejárt. */
export function getStamp(key: string): string | undefined {
  return store.get(key)?.stamp;
}

export function setCached<T>(
  key: string,
  value: T,
  ttlMinutes: number,
  stamp?: string,
): T {
  store.set(key, { value, expiresAt: Date.now() + ttlMinutes * 60_000, stamp });
  return value;
}

/**
 * Lejárt bejegyzés élettartamának meghosszabbítása változatlan tartalommal.
 *
 * Akkor kell, amikor újra lekérdeztük a forrást, és a bélyege (lastUpdate)
 * ugyanaz: az adat nem változott, felesleges újra feldolgozni.
 */
export function touchCached<T>(key: string, ttlMinutes: number): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  e.expiresAt = Date.now() + ttlMinutes * 60_000;
  return e.value as T;
}

export function clearCache(key?: string): void {
  if (key) store.delete(key);
  else store.clear();
}

/** Diagnosztikához: hány bejegyzés van, és mikor járnak le. */
export function cacheStats() {
  return [...store.entries()].map(([key, e]) => ({
    key,
    expiresInSec: Math.round((e.expiresAt - Date.now()) / 1000),
    stamp: e.stamp,
  }));
}
