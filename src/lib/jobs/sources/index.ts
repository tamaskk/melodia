/**
 * Forrás-regiszter és párhuzamos futtatás.
 *
 * fetchAll() = a nyers réteg: minden forrást párhuzamosan futtat,
 * Promise.allSettled-del gyűjt, és forrásonként adja vissza az eredményt.
 * searchAll() = erre épül: dedup, szűrés, rendezés, limit.
 */
import { setMaxListeners } from "node:events";
import { jobsEnv } from "../env";
import { atsSources } from "./ats";
import { remoteSources } from "./remote";
import { keyedSources } from "./keyed";
import { SourceError } from "../http";
import { healthOf, recordFailure, recordSuccess } from "../health";
import { dedupe, matchesQuery } from "../normalize";
import type {
  CatalogSource,
  Job,
  JobSource,
  SearchParams,
  SearchResponse,
  SourceResult,
  SourceRunResult,
} from "../types";

export const ALL_SOURCES: JobSource[] = [
  ...atsSources,
  ...remoteSources,
  ...keyedSources,
];

/** Egy forrás akkor fut, ha nem kér kulcsot, vagy minden env változója be van állítva. */
export function isEnabled(source: JobSource): boolean {
  const keys = source.meta.envKeys;
  if (!keys?.length) return true;
  return keys.every((k) => Boolean(jobsEnv(k)));
}

export function sourceCatalog(): CatalogSource[] {
  return ALL_SOURCES.map((s) => ({
    ...s.meta,
    enabled: isEnabled(s),
    missingEnv: (s.meta.envKeys ?? []).filter((k) => !jobsEnv(k)),
  }));
}

/** Az egész futásra vonatkozó plafon, hogy egy lassú forrás se fagyassza be a keresést. */
const GLOBAL_TIMEOUT_MS = 25000;

export interface FetchAllEntry {
  /** A forrás futásának összefoglalója — ez megy ki a UI-ra. */
  run: SourceRunResult;
  /** A találatok, ha a forrás lefutott. Hiba vagy kihagyás esetén üres. */
  result: SourceResult | null;
}

/**
 * Minden (kiválasztott) forrás párhuzamos futtatása.
 *
 * Egyetlen forrás sem dobhat ki minket: a hibát a forrás sorába írjuk, és a
 * többi találata rendben megjön. Ezért van Promise.allSettled és forrásonkénti
 * try/catch is — az allSettled a váratlan hibát fogja, a try/catch a
 * tipizáltat (SourceError), amiből a UI-nak értelmes üzenetet adunk.
 */
export async function fetchAll(
  params: SearchParams,
  onlySources?: string[],
  outerSignal?: AbortSignal,
): Promise<FetchAllEntry[]> {
  const ctrl = new AbortController();
  // Minden hívás erre a jelre iratkozik fel — a Node alapértelmezett 10-es
  // figyelmeztetési küszöbe itt nem szivárgást jelezne.
  setMaxListeners(0, ctrl.signal);
  const globalTimer = setTimeout(() => ctrl.abort(), GLOBAL_TIMEOUT_MS);
  outerSignal?.addEventListener("abort", () => ctrl.abort(), { once: true });

  const selected = ALL_SOURCES.filter(
    (s) => !onlySources?.length || onlySources.includes(s.meta.id),
  );

  try {
    const settled = await Promise.allSettled(
      selected.map(async (source): Promise<FetchAllEntry> => {
        const base = {
          sourceId: source.meta.id,
          name: source.meta.name,
          category: source.meta.category,
          warning: source.meta.warning,
          docs: source.meta.docs,
        };

        if (!isEnabled(source)) {
          return {
            run: {
              ...base,
              ok: false,
              count: 0,
              durationMs: 0,
              skipped: true,
              errorKind: "config",
              error: `Hiányzó env: ${(source.meta.envKeys ?? []).join(", ")}`,
            },
            result: null,
          };
        }

        const t0 = Date.now();
        try {
          const result = await source.fetchJobs(params, ctrl.signal);
          recordSuccess(source.meta.id);
          return {
            run: {
              ...base,
              ok: true,
              count: result.jobs.length,
              durationMs: Date.now() - t0,
              rawCount: result.meta.rawCount,
              dropped: result.meta.dropped,
              fetchedAt: result.meta.fetchedAt,
            },
            result,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const kind = err instanceof SourceError ? err.kind : "unavailable";
          // Az egymást követő hibák számolása itt történik, minden forrásra —
          // nem csak a BA-ra, mert bármelyik API megszűnhet. A beállítási hiba
          // (kikapcsolt élő hívás, betelt keret) viszont szándékos állapot:
          // attól a forrás nem "halott".
          const alert =
            kind !== "config" && recordFailure(source.meta.id, message);
          return {
            run: {
              ...base,
              ok: false,
              count: 0,
              durationMs: Date.now() - t0,
              errorKind: kind,
              error: message,
              alert,
              consecutiveFailures: healthOf(source.meta.id).consecutiveFailures,
            },
            result: null,
          };
        }
      }),
    );

    return settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  } finally {
    clearTimeout(globalTimer);
  }
}

export async function searchAll(
  params: SearchParams,
  onlySources?: string[],
): Promise<SearchResponse> {
  const started = Date.now();
  const entries = await fetchAll(params, onlySources);

  // Az ATS-források nem tudnak keresni — a query-szűrés központilag itt történik.
  let all: Job[] = [];
  for (const e of entries) {
    if (!e.result) continue;
    const matching = e.result.jobs.filter((j) => matchesQuery(j, params.q));
    e.run.count = matching.length;
    all = all.concat(matching);
  }

  const filtered = dedupe(all)
    .filter((j) => (params.remoteOnly ? j.remote : true))
    // Az országszűrő az elsődleges ÉS a másodlagos országokat is nézi — egy
    // hirdetés, aminek a fő lokációja US, de Berlinben is nyitva van, HU/DE
    // szűrésnél nem eshet ki.
    .filter((j) => {
      if (!params.countries?.length) return true;
      const all = [j.country, ...(j.alsoCountries ?? [])].filter(
        Boolean,
      ) as string[];
      return all.some((c) => params.countries!.includes(c));
    })
    .sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));

  const unique = filtered.slice(0, params.limit);

  return {
    query: params.q,
    jobs: unique,
    sources: entries.map((e) => e.run).sort((a, b) => b.count - a.count),
    totalRaw: all.length,
    totalUnique: unique.length,
    durationMs: Date.now() - started,
  };
}
