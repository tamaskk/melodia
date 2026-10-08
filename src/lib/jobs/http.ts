/**
 * Közös HTTP réteg: timeout, retry, leíró User-Agent.
 *
 * A User-Agent nem kozmetika — a RemoteOK alapértelmezett UA-val 403-at ad.
 * Állítsd be a sajátodat (USER_AGENT az atlas-credentials.env-ben), hogy a forrásoldalak
 * tudják, ki kopogtat.
 */

import { jobsEnv } from "./env";

export const USER_AGENT =
  jobsEnv("USER_AGENT") ?? "Melodia/1.0 (personal job search)";

export type SourceErrorKind = "unavailable" | "timeout" | "parse" | "config";

/**
 * Tipizált forráshiba. Egy halott forrás nem döntheti el az egész futást —
 * a searchAll ezt elkapja, és a forrás pirosan jelenik meg a UI-on, miközben
 * a többi forrás találata megjön.
 */
export class SourceError extends Error {
  constructor(
    message: string,
    readonly kind: SourceErrorKind = "unavailable",
    readonly status?: number,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

/** A forrás nem elérhető: nem-200 válasz, hálózati hiba, vagy timeout. */
export class SourceUnavailableError extends SourceError {
  constructor(
    message: string,
    status?: number,
    kind: SourceErrorKind = "unavailable",
  ) {
    super(message, kind, status);
    this.name = "SourceUnavailableError";
  }
}

/** A válasz megjött, de nem értelmezhető (nem JSON, hibás XML). */
export class SourceParseError extends SourceError {
  constructor(message: string) {
    super(message, "parse");
    this.name = "SourceParseError";
  }
}

interface FetchOpts {
  signal: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  /** Hány ÚJRAPRÓBÁLKOZÁS az első kísérlet után. Felső korlát: MAX_RETRIES. */
  retries?: number;
}

/**
 * Exponenciális backoff: 600 ms, 1200 ms, 2400 ms.
 *
 * A felső korlát azért 3, mert a források napi kerete szűk (Adzuna 250/nap,
 * Remotive napi 4 lekérés az ajánlás) — a vak ismételgetés itt nem
 * rugalmasság, hanem keretpazarlás. Kulcsos forrásnál adj át retries: 0-t.
 */
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 600;

function backoffMs(attempt: number) {
  return BACKOFF_BASE_MS * 2 ** attempt;
}

async function raw(url: string, opts: FetchOpts): Promise<Response> {
  const { timeoutMs = 15000 } = opts;
  const retries = Math.min(opts.retries ?? 2, MAX_RETRIES);
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Saját timeout, ami tiszteletben tartja a hívó abort jelét is.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onOuterAbort = () => ctrl.abort();
    opts.signal.addEventListener("abort", onOuterAbort, { once: true });

    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: { "User-Agent": USER_AGENT, Accept: "*/*", ...opts.headers },
        body: opts.body,
        signal: ctrl.signal,
        cache: "no-store",
      });

      // 429 és 5xx: érdemes újrapróbálni. 4xx egyéb: nincs értelme.
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      if (!res.ok) {
        // A query kulcsot vihet (api_key, app_key) — az üzenet a válaszba és
        // a naplóba is eljut, ezért csak a cím query előtti része kerül bele.
        throw new SourceUnavailableError(
          `HTTP ${res.status} — ${url.split("?")[0]}`,
          res.status,
        );
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (opts.signal.aborted)
        throw new SourceUnavailableError("Megszakítva", undefined, "timeout");
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (isAbort && attempt >= retries)
        throw new SourceUnavailableError(
          `Timeout (${timeoutMs}ms)`,
          undefined,
          "timeout",
        );
      // Nem-200: nincs értelme újrapróbálni, a raw() fentebb már eldöntötte.
      if (err instanceof SourceUnavailableError && err.status) throw err;
      if (attempt >= retries) break;
      await sleep(backoffMs(attempt));
    } finally {
      clearTimeout(timer);
      opts.signal.removeEventListener("abort", onOuterAbort);
    }
  }
  throw lastErr instanceof Error
    ? new SourceUnavailableError(lastErr.message)
    : new SourceUnavailableError("Ismeretlen hiba");
}

export async function getJson<T = unknown>(
  url: string,
  opts: FetchOpts,
): Promise<T> {
  const res = await raw(url, opts);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SourceParseError(`Nem JSON válasz (${text.slice(0, 80)}…)`);
  }
}

/**
 * Mint a getJson, de a VÁLASZFEJLÉCEKET is visszaadja.
 *
 * Néhány forrás a fejlécekben mondja meg, hol tartunk a keretben
 * (The Muse: `X-RateLimit-Remaining`). Enélkül csak találgatni lehetne.
 */
export async function getJsonWithHeaders<T = unknown>(
  url: string,
  opts: FetchOpts,
): Promise<{ data: T; headers: Headers }> {
  const res = await raw(url, opts);
  const text = await res.text();
  try {
    return { data: JSON.parse(text) as T, headers: res.headers };
  } catch {
    throw new SourceParseError(`Nem JSON válasz (${text.slice(0, 80)}…)`);
  }
}

export async function postJson<T = unknown>(
  url: string,
  body: unknown,
  opts: FetchOpts,
): Promise<T> {
  return getJson<T>(url, {
    ...opts,
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
}

export async function getText(url: string, opts: FetchOpts): Promise<string> {
  const res = await raw(url, opts);
  return res.text();
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Több cég board-ját kérdezi le párhuzamosan, korlátozott konkurenciával.
 *
 * Egy elavult slug (404) csendben kimarad — a seed listában lesznek ilyenek,
 * és egy halott cég nem döntheti el az egész forrást.
 *
 * DE ha MINDEN cég elbukik, az már nem "nincs találat", hanem hiba: a forrás
 * elérhetetlen, vagy megváltozott az API. Ilyenkor dobunk, hogy a UI-on
 * pirosan lássd — különben egy néma "ok 0" elrejtené a valódi problémát.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R[]>,
): Promise<R[]> {
  const out: R[] = [];
  const errors: Error[] = [];
  let i = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (i < items.length) {
        const item = items[i++];
        try {
          out.push(...(await fn(item)));
        } catch (err) {
          errors.push(err instanceof Error ? err : new Error(String(err)));
        }
      }
    },
  );
  await Promise.all(workers);

  if (items.length > 0 && errors.length === items.length) {
    const first = errors[0];
    throw new SourceError(
      `Mind a ${items.length} lekérdezés elbukott — pl.: ${first.message}`,
      first instanceof SourceError ? first.kind : "unavailable",
    );
  }
  return out;
}
