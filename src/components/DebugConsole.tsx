"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { downloadText } from "@/lib/export";
import type { LogEntry, LogLevel } from "@/lib/logger";

const LEVEL_STYLE: Record<LogLevel, string> = {
  debug: "text-[var(--muted)]",
  info: "text-cyan-300",
  warn: "text-amber-300",
  error: "text-red-400",
};

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MAX_ROWS = 2000;

export default function DebugConsole({
  initialScope = "",
  initialLevel = "debug",
}: {
  /** URL-ből: `/debug?scope=kuldes` — a futtató sávok hibalinkje ezt adja. */
  initialScope?: string;
  initialLevel?: LogLevel;
} = {}) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [minLevel, setMinLevel] = useState<LogLevel>(initialLevel);
  const [scope, setScope] = useState(initialScope);
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);

  const bottom = useRef<HTMLDivElement>(null);
  // A szünet állapotát refben is tartjuk, hogy az SSE-kezelő mindig a
  // friss értéket lássa anélkül, hogy újra kellene kötni a streamet.
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const source = new EventSource("/api/debug/stream");
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      if (pausedRef.current) return;
      const entry = JSON.parse(event.data) as LogEntry;
      setEntries((current) => {
        const next = [...current, entry];
        return next.length > MAX_ROWS ? next.slice(-MAX_ROWS) : next;
      });
    };
    return () => source.close();
  }, []);

  const scopes = useMemo(
    () =>
      [
        ...new Set([
          ...entries.map((entry) => entry.scope.split("#")[0]),
          ...(scope ? [scope] : []),
        ]),
      ].sort(),
    [entries, scope],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (LEVEL_ORDER[entry.level] < LEVEL_ORDER[minLevel]) return false;
      if (scope && !entry.scope.startsWith(scope)) return false;
      if (!needle) return true;
      return (
        entry.message.toLowerCase().includes(needle) ||
        entry.scope.toLowerCase().includes(needle) ||
        JSON.stringify(entry.data ?? "")
          .toLowerCase()
          .includes(needle)
      );
    });
  }, [entries, minLevel, query, scope]);

  useEffect(() => {
    if (follow && !paused) bottom.current?.scrollIntoView({ block: "end" });
  }, [visible.length, follow, paused]);

  const asText = useCallback(
    () =>
      visible
        .map(
          (entry) =>
            `${entry.at} ${entry.level.toUpperCase().padEnd(5)} [${entry.scope}] ${entry.message}` +
            (entry.ms !== undefined ? ` +${Math.round(entry.ms)}ms` : "") +
            (entry.data !== undefined ? ` ${JSON.stringify(entry.data)}` : ""),
        )
        .join("\n"),
    [visible],
  );

  const counts = useMemo(
    () => ({
      warn: entries.filter((entry) => entry.level === "warn").length,
      error: entries.filter((entry) => entry.level === "error").length,
    }),
    [entries],
  );

  return (
    <div className="mx-auto flex h-[calc(100dvh-53px)] w-full max-w-[1400px] flex-col gap-3 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Élő napló</h1>
          <p className="text-sm text-[var(--muted)]">
            Élő backend-napló: adatbázis, import, konverter és az AI keresés
            minden lépése. Ugyanez fut a `next dev` termináljában is.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-lg border px-3 text-sm leading-9 ${
              connected
                ? "border-emerald-500/50 text-emerald-300"
                : "border-red-500/50 text-red-300"
            }`}
          >
            <span
              className={`inline-block size-2 rounded-full ${
                connected ? "bg-emerald-400" : "bg-red-400"
              }`}
            />
            {connected ? "kapcsolódva" : "nincs kapcsolat"}
          </span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Keresés a naplóban: cégnév, URL, hibaüzenet…"
          className="h-9 min-w-[240px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm outline-none focus:border-blue-500"
        />

        <select
          value={minLevel}
          onChange={(event) => setMinLevel(event.target.value as LogLevel)}
          className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm outline-none focus:border-blue-500"
        >
          <option value="debug">minden (debug)</option>
          <option value="info">info és fölötte</option>
          <option value="warn">csak figyelmeztetés</option>
          <option value="error">csak hiba</option>
        </select>

        <select
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm outline-none focus:border-blue-500"
        >
          <option value="">minden hatókör</option>
          {scopes.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setPaused((current) => !current)}
          className={`h-9 rounded-lg border px-3 text-sm transition ${
            paused
              ? "border-amber-500 text-amber-300"
              : "border-[var(--border)] hover:border-blue-500"
          }`}
        >
          {paused ? "▶ Folytatás" : "⏸ Szünet"}
        </button>

        <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={follow}
            onChange={(event) => setFollow(event.target.checked)}
            className="size-4 accent-blue-500"
          />
          görgetés az aljára
        </label>

        <button
          type="button"
          onClick={() => void copyToClipboard(asText())}
          className="h-9 rounded-lg border border-[var(--border)] px-3 text-sm transition hover:border-blue-500"
        >
          Másolás
        </button>
        <button
          type="button"
          onClick={() =>
            downloadText(asText(), "melodia-log.txt", "text/plain")
          }
          className="h-9 rounded-lg border border-[var(--border)] px-3 text-sm transition hover:border-blue-500"
        >
          Letöltés
        </button>
        <button
          type="button"
          onClick={() => setEntries([])}
          className="h-9 rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--muted)] transition hover:text-foreground"
        >
          Ürítés
        </button>

        <span className="ml-auto text-xs text-[var(--muted)]">
          {visible.length}/{entries.length} sor
          {counts.warn ? ` · ${counts.warn} figyelmeztetés` : ""}
          {counts.error ? ` · ${counts.error} hiba` : ""}
        </span>
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2 font-mono text-xs leading-relaxed">
        {visible.length === 0 ? (
          <p className="p-3 text-[var(--muted)]">
            Még nincs napló. Indíts egy keresést vagy importot a másik fülön —
            itt azonnal megjelenik.
          </p>
        ) : null}

        {visible.map((entry) => (
          <div
            key={entry.id}
            onClick={() =>
              setOpenId((current) => (current === entry.id ? null : entry.id))
            }
            className="cursor-pointer border-b border-[var(--border)]/40 px-2 py-1 hover:bg-[var(--surface)]"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[var(--muted)]">
                {entry.at.slice(11, 23)}
              </span>
              <span className={`w-12 shrink-0 ${LEVEL_STYLE[entry.level]}`}>
                {entry.level}
              </span>
              <span className="text-violet-300">[{entry.scope}]</span>
              <span className="whitespace-pre-wrap">{entry.message}</span>
              {entry.ms !== undefined ? (
                <span className="text-emerald-400">
                  +{Math.round(entry.ms)}ms
                </span>
              ) : null}
              {entry.data !== undefined && openId !== entry.id ? (
                <span className="truncate text-[var(--muted)]">
                  {JSON.stringify(entry.data).slice(0, 140)}
                </span>
              ) : null}
            </div>
            {openId === entry.id && entry.data !== undefined ? (
              <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--background)] p-2 text-[11px]">
                {JSON.stringify(entry.data, null, 2)}
              </pre>
            ) : null}
          </div>
        ))}
        <div ref={bottom} />
      </div>
    </div>
  );
}
