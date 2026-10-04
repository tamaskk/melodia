/**
 * Munkaidő-ablak a CÍMZETT helyi idejében.
 *
 * A szerver órája csak a feladónak mond valamit: egy budapesti 9:00 New
 * Yorkban hajnali 3 óra. Itt minden ország a saját időzónáját kapja, és a
 * küldő azt veszi előre a sorból, akinél épp munkaidő van.
 *
 * Tiszta modul (adatbázis nélkül) — a kiküldés és a felület is használja.
 */

/** Ország → időzóna. Több zónás országnál a legnagyobb üzleti központé. */
const TIME_ZONES: Record<string, string> = {
  HU: "Europe/Budapest",
  AT: "Europe/Vienna",
  DE: "Europe/Berlin",
  CH: "Europe/Zurich",
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  ES: "Europe/Madrid",
  PT: "Europe/Lisbon",
  FR: "Europe/Paris",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  PL: "Europe/Warsaw",
  CZ: "Europe/Prague",
  RO: "Europe/Bucharest",
  BG: "Europe/Sofia",
  CY: "Asia/Nicosia",
  DK: "Europe/Copenhagen",
  SE: "Europe/Stockholm",
  FI: "Europe/Helsinki",
  EE: "Europe/Tallinn",
  AE: "Asia/Dubai",
  // Az amerikai ügynökségek zöme a keleti parton van.
  US: "America/New_York",
};

/** Ismeretlen vagy nemzetközi (INT) országnál a feladó ideje számít. */
export const DEFAULT_TIME_ZONE = "Europe/Budapest";

export function timeZoneFor(country: string | null | undefined): string {
  return (country && TIME_ZONES[country]) || DEFAULT_TIME_ZONE;
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const partsCache = new Map<string, Intl.DateTimeFormat>();

/** A nap, óra és perc az adott időzónában. */
export function localParts(
  date: Date,
  timeZone: string,
): { weekday: number; hour: number; minute: number } {
  let format = partsCache.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    partsCache.set(timeZone, format);
  }
  const parts = Object.fromEntries(
    format.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    weekday: WEEKDAYS[parts.weekday] ?? 0,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** Hétköznap, `from` és `to` óra között (a `to` már nem fér bele). */
export function insideWindowAt(
  date: Date,
  timeZone: string,
  from: number,
  to: number,
): boolean {
  const { weekday, hour } = localParts(date, timeZone);
  if (weekday === 0 || weekday === 6) return false;
  return hour >= from && hour < to;
}

/**
 * Mikor kezdődik legközelebb a munkaidő abban az időzónában. Egész órákon
 * lépked (az ablak egész órakor nyílik), így a nyári időszámítás váltása sem
 * csúsztatja el. Legfeljebb 8 napot néz előre.
 */
export function nextWindowStart(
  date: Date,
  timeZone: string,
  from: number,
  to: number,
): Date {
  if (insideWindowAt(date, timeZone, from, to)) return date;
  const probe = new Date(date);
  probe.setUTCMinutes(0, 0, 0);
  for (let step = 0; step < 8 * 24; step += 1) {
    probe.setUTCHours(probe.getUTCHours() + 1);
    if (insideWindowAt(probe, timeZone, from, to)) return new Date(probe);
  }
  return new Date(date.getTime() + 24 * 3_600_000);
}

/** „szerda 09:00” — a felületen és a naplóban, a címzett helyi idejében. */
export function localLabel(date: Date, timeZone: string): string {
  return date.toLocaleString("hu-HU", {
    timeZone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * A sorból az első, akinél a saját helyi idejében munkaidő van. Ha senkinél,
 * akkor a legkorábbi nyitás ideje és országa (országonként egyszer számolva).
 */
export function pickRecipient(
  queue: string[],
  countryOf: (id: string) => string | undefined,
  now: Date,
  from: number,
  to: number,
): { index: number } | { waitUntil: Date; country: string } {
  const index = queue.findIndex((id) =>
    insideWindowAt(now, timeZoneFor(countryOf(id)), from, to),
  );
  if (index !== -1) return { index };

  let best: { waitUntil: Date; country: string } | null = null;
  for (const country of new Set(queue.map((id) => countryOf(id) ?? "INT"))) {
    const at = nextWindowStart(now, timeZoneFor(country), from, to);
    if (!best || at < best.waitUntil) best = { waitUntil: at, country };
  }
  return (
    best ?? { waitUntil: new Date(now.getTime() + 15 * 60_000), country: "INT" }
  );
}

/** Teszt módban (időkorlát nélkül) egy indításra legfeljebb ennyi levél megy. */
export const TEST_MODE_LIMIT = 3;
