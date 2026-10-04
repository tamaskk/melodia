/**
 * Élő, strukturált naplózás — a `next dev` terminálba és a /debug oldalra.
 *
 * Minden sor: idő, szint, hatókör (scope), üzenet, eltelt ms, rövid adat.
 * A bejegyzések egy körkörös pufferbe is bekerülnek, amit a /api/debug/stream
 * SSE-n keresztül élőben lehet nézni a böngészőben.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: number;
  at: string;
  level: LogLevel;
  scope: string;
  message: string;
  /** Eltelt idő a lépés kezdete óta, ha mérjük. */
  ms?: number;
  data?: unknown;
}

const BUFFER_SIZE = 800;
const buffer: LogEntry[] = [];
const listeners = new Set<(entry: LogEntry) => void>();
let counter = 0;

/** Titkokat soha nem írunk ki — kulcs, jelszó, connection string. */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "…";
  if (typeof value === "string") {
    return value
      .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
      .replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)[^@]+@/g, "$1***@")
      .replace(/(Bearer\s+)[A-Za-z0-9._-]+/g, "$1***");
  }
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => redact(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 40)
        .map(([key, item]) => [
          key,
          // Pontos kulcsnévre szűrünk: az "input_tokens" darabszám, nem titok.
          /^(api_?key|apikey|key|token|access_token|refresh_token|secret|password|passwd|authorization|auth|bearer|credentials?)$/i.test(
            key,
          )
            ? "***"
            : redact(item, depth + 1),
        ]),
    );
  }
  return value;
}

const ESC = String.fromCharCode(27);
const COLOR: Record<LogLevel, string> = {
  debug: `${ESC}[38;5;245m`,
  info: `${ESC}[36m`,
  warn: `${ESC}[33m`,
  error: `${ESC}[31m`,
};
const DIM = `${ESC}[2m`;
const BOLD = `${ESC}[1m`;
const RESET = `${ESC}[0m`;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? "debug").toLowerCase() as LogLevel;
  return LEVEL_ORDER[configured] ?? LEVEL_ORDER.debug;
}

/** Rövid, egysoros adatelőnézet a terminálra — a teljes adat a /debug oldalon van. */
function preview(data: unknown): string {
  if (data === undefined) return "";
  try {
    const text = typeof data === "string" ? data : JSON.stringify(data);
    if (!text) return "";
    return text.length > 220 ? `${text.slice(0, 220)}…` : text;
  } catch {
    return "[nem sorosítható]";
  }
}

export function emit(
  level: LogLevel,
  scope: string,
  message: string,
  data?: unknown,
  ms?: number,
): LogEntry {
  const entry: LogEntry = {
    id: ++counter,
    at: new Date().toISOString(),
    level,
    scope,
    message,
    ...(ms !== undefined ? { ms } : {}),
    ...(data !== undefined ? { data: redact(data) } : {}),
  };

  buffer.push(entry);
  if (buffer.length > BUFFER_SIZE) buffer.shift();
  for (const listener of listeners) listener(entry);

  if (LEVEL_ORDER[level] >= threshold()) {
    const clock = entry.at.slice(11, 23);
    const took = ms === undefined ? "" : ` ${DIM}+${Math.round(ms)}ms${RESET}`;
    const body = preview(entry.data);
    console.log(
      `${DIM}${clock}${RESET} ${COLOR[level]}${level.toUpperCase().padEnd(5)}${RESET} ` +
        `${BOLD}[${scope}]${RESET} ${message}${took}` +
        (body ? ` ${DIM}${body}${RESET}` : ""),
    );
  }

  return entry;
}

export interface Logger {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
  /** Lépés indítása: a visszaadott függvény lezárja, és kiírja az eltelt időt. */
  step: (
    message: string,
    data?: unknown,
  ) => (result?: string, resultData?: unknown) => void;
  /** Alárendelt hatókör, pl. `email-search:claude`. */
  child: (suffix: string) => Logger;
  scope: string;
}

export function createLogger(scope: string): Logger {
  return {
    scope,
    debug: (message, data) => void emit("debug", scope, message, data),
    info: (message, data) => void emit("info", scope, message, data),
    warn: (message, data) => void emit("warn", scope, message, data),
    error: (message, data) => void emit("error", scope, message, data),
    step: (message, data) => {
      const started = Date.now();
      emit("info", scope, `▶ ${message}`, data);
      return (result = "kész", resultData?: unknown) =>
        void emit(
          "info",
          scope,
          `✔ ${message} — ${result}`,
          resultData,
          Date.now() - started,
        );
    },
    child: (suffix) => createLogger(`${scope}:${suffix}`),
  };
}

/** A puffer tartalma — a /debug oldal ebből indul. */
export function snapshot(limit = BUFFER_SIZE): LogEntry[] {
  return buffer.slice(-limit);
}

export function subscribe(listener: (entry: LogEntry) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Rövid, olvasható azonosító egy kéréshez. */
export function requestId(): string {
  return Math.random().toString(36).slice(2, 8);
}
