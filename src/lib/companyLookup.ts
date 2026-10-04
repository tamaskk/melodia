/**
 * „Megvan-e már ez a cég?" — egy beillesztett névlista összevetése az
 * adatbázissal.
 *
 * A neveket nem nyersen hasonlítjuk össze: a `companyAliases` levágja a jogi
 * formát és az írásjeleket ("Régens Zrt." → "regens"), és ugyanezek az aliasok
 * a soron is el vannak mentve (`aliases` mező, indexelve). Így egyetlen `$in`
 * lekérdezés megválaszolja a kérdést — a teljes cégnév-lista áthúzása az Atlas
 * M0-n másfél percig tartana.
 */
import { companyAliases } from "./companyMatch";
import { createLogger } from "./logger";
import { getContacts } from "./mongodb";

const log = createLogger("ellenorzes");

/** Egy kérésben ennyi nevet nézünk meg; a többit a felület levágja. */
export const MAX_NAMES = 5000;

/** Egy `$in` ennyi aliast kap — az M0 a nagyon hosszú listát nem szereti. */
const CHUNK = 400;

export interface CheckHit {
  /** A beillesztett név, ahogy te írtad. */
  name: string;
  /** Az adatbázisban szereplő cégnév. */
  company: string;
  country: string;
  primaryEmail: string | null;
  sent: boolean;
  done: boolean;
  source: string;
  id: string;
}

export interface CheckResult {
  /** Amit beillesztettél, üres sorok és ismétlődések nélkül. */
  total: number;
  /** A bemenetben többször szereplő nevek (egyszer vizsgáltuk őket). */
  duplicates: string[];
  found: CheckHit[];
  missing: string[];
}

/**
 * A beillesztett szöveg névlistává alakítása.
 *
 * Elfogad JSON tömböt (`["A", "B"]`), soronkénti listát, vessző- és
 * pontosvessző-elválasztást, és a sorszámozást is levágja ("1. Cég").
 */
export function parseNames(raw: string): string[] {
  const text = raw.trim();
  if (!text) return [];

  // JSON tömb: ez a leggyakoribb bemenet, próbáljuk először.
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text.replace(/,\s*]$/, "]")) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) =>
            typeof item === "string"
              ? item
              : typeof item === "object" && item !== null
                ? String((item as Record<string, unknown>).company ?? "")
                : "",
          )
          .map(clean)
          .filter(Boolean);
      }
    } catch {
      // Nem érvényes JSON — jöhet a soronkénti feldolgozás.
    }
  }

  return text
    .split(/[\n;]+/)
    // A vessző elválasztó, de csak akkor, ha nincs sortörés a szövegben.
    .flatMap((line) => (text.includes("\n") ? [line] : line.split(",")))
    .map(clean)
    .filter(Boolean);
}

function clean(value: string): string {
  return value
    .replace(/^\s*[-*•]\s*/, "")
    .replace(/^\s*\d+[.)]\s*/, "")
    .replace(/^["'`\s]+|["'`,\s]+$/g, "")
    .trim();
}

/**
 * Melyik név van már a listában és melyik nincs.
 *
 * Az egyezés aliasszintű: „Példa Tech Kft." és „Példa Tech" ugyanaz. Ország
 * szerint **nem** szűkítünk — a beillesztett listában általában nincs ország,
 * és inkább jelezzünk egy meglévő céget, mint hogy másodszor is kiküldjünk neki.
 */
export async function checkCompanies(names: string[]): Promise<CheckResult> {
  const started = Date.now();

  // Ismétlődés a bemenetben: egyszer vizsgáljuk, de jelezzük.
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const name of names.slice(0, MAX_NAMES)) {
    const signature = companyAliases(name)[0] ?? name.toLowerCase();
    if (seen.has(signature)) {
      duplicates.push(name);
      continue;
    }
    seen.set(signature, name);
  }

  const unique = [...seen.values()];
  if (!unique.length) {
    return { total: 0, duplicates, found: [], missing: [] };
  }

  // alias → a te neved. Egy névnek több aliasa is lehet (zárójeles alak).
  const aliasToName = new Map<string, string>();
  for (const name of unique) {
    for (const alias of companyAliases(name)) {
      if (!aliasToName.has(alias)) aliasToName.set(alias, name);
    }
  }

  const collection = await getContacts();
  const aliases = [...aliasToName.keys()];
  const hits = new Map<string, CheckHit>();

  for (let start = 0; start < aliases.length; start += CHUNK) {
    const slice = aliases.slice(start, start + CHUNK);
    const docs = await collection
      .find(
        { aliases: { $in: slice } },
        {
          projection: {
            company: 1,
            country: 1,
            primaryEmail: 1,
            sent: 1,
            done: 1,
            source: 1,
            aliases: 1,
          },
        },
      )
      .toArray();

    for (const doc of docs) {
      for (const alias of doc.aliases ?? []) {
        const name = aliasToName.get(alias);
        // Az első találat nyer: egy névhez egy sort mutatunk.
        if (!name || hits.has(name)) continue;
        hits.set(name, {
          name,
          company: doc.company,
          country: doc.country,
          primaryEmail: doc.primaryEmail ?? null,
          sent: Boolean(doc.sent),
          done: Boolean(doc.done),
          source: doc.source,
          id: String(doc._id),
        });
      }
    }
  }

  const found = unique.filter((name) => hits.has(name)).map((name) => hits.get(name)!);
  const missing = unique.filter((name) => !hits.has(name));

  log.info(
    `ellenőrzés: ${unique.length} név → ${found.length} megvan, ${missing.length} hiányzik`,
    { ms: Date.now() - started, duplikatum: duplicates.length },
  );

  return { total: unique.length, duplicates, found, missing };
}
