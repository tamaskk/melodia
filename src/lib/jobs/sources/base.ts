/**
 * Adapter-alapok. Minden forrás ezen a két függvényen keresztül ad vissza
 * eredményt — így a dedupKey, a séma-validáció és a fetch-metaadat egy helyen
 * dől el, nem 18 példányban.
 */
import { createLogger } from "../../logger";
import { buildDedupKey, missingRequiredFields } from "../normalize";
import type {
  Job,
  JobSource,
  SearchParams,
  SourceMeta,
  SourceResult,
} from "../types";

const log = createLogger("jobs");

/**
 * Job összeállítása. A `dedupKey`-t itt számoljuk, hogy ne lehessen kihagyni.
 * A `raw` mezőt a hívó adja meg — mindig a nyers forrásobjektumot, érintetlenül.
 */
export function makeJob(job: Omit<Job, "dedupKey">): Job {
  return {
    ...job,
    dedupKey: buildDedupKey(job.company, job.title, job.country),
  };
}

/**
 * Adapter-kimenet lezárása: séma-validáció + fetch-metaadat.
 *
 * A hiányos rekord nem hiba: eldobjuk, megszámoljuk, és megyünk tovább.
 * Az üres eredmény szintén érvényes állapot (sok ATS-fióknak tényleg
 * 0 nyitott pozíciója van) — nem dobunk miatta.
 */
export function toResult(sourceId: string, jobs: Job[]): SourceResult {
  const valid: Job[] = [];
  let dropped = 0;

  for (const job of jobs) {
    const missing = missingRequiredFields(job);
    // A kártya címe a hirdetésre mutató link: csak webcím mehet tovább.
    if (!missing.length && !/^https?:\/\//i.test(job.url)) missing.push("url");
    if (missing.length) {
      dropped++;
      log.debug(
        `[${sourceId}] hirdetés kihagyva — hiányzó mező: ${missing.join(", ")}`,
      );
      continue;
    }
    valid.push(job);
  }

  return {
    jobs: valid,
    meta: {
      fetchedAt: new Date().toISOString(),
      source: sourceId,
      rawCount: jobs.length,
      dropped,
    },
  };
}

/**
 * Amit egy adapter ténylegesen ír: meta + egy fetch, ami Job[]-et ad.
 * A SourceResult-ba csomagolást (validáció, fetchedAt, rawCount) a
 * defineSource intézi — így nem lehet elfelejteni.
 */
export interface RawJobSource {
  meta: SourceMeta;
  fetch(params: SearchParams, signal: AbortSignal): Promise<Job[]>;
}

export function defineSource(src: RawJobSource): JobSource {
  return {
    meta: src.meta,
    async fetchJobs(params, signal) {
      return toResult(src.meta.id, await src.fetch(params, signal));
    },
  };
}
