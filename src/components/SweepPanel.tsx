"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReportActive } from "./useReportActive";
import { useStatusPoll } from "./useStatusPoll";
import Link from "next/link";
import { PROVIDER_LABELS } from "./Dashboard";
import type { SearchProviderChoice } from "@/lib/useSearchProvider";
import { formatNumber } from "@/lib/format";
import RunMessage from "./RunMessage";
import { useNow } from "./useNow";

interface SweepItem {
  company: string;
  email: string | null;
  confidence: string;
  filled: boolean;
  ms: number;
  error?: string;
}

interface SweepState {
  status: "idle" | "running" | "stopping" | "done" | "error";
  provider: string;
  total: number;
  processed: number;
  found: number;
  filled: number;
  failed: number;
  current: string | null;
  scope?: "adatbazis" | "kijelolt" | "szurt";
  candidates?: number;
  /** Amin épp dolgozunk — töltés-jelzős sorok a lista tetején. */
  active?: { company: string; startedAt: string }[];
  /** Egyszerre hány cégen dolgozik. */
  concurrency: number;
  startedAt: string | null;
  etaSeconds: number | null;
  message: string | null;
  recent: SweepItem[];
}

function humanTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  if (seconds < 90) return `${seconds} mp`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} perc`;
  return `${(minutes / 60).toFixed(1)} óra`;
}

/**
 * Automatikus e-mail begyűjtés: egyesével végigmegy a cím nélküli cégeken.
 * A futás a szerveren él, ez a doboz csak nézi és megállítja.
 */
export default function SweepPanel({
  provider,
  onProviderChange,
  onFinished,
  onActiveChange,
  filters,
  filteredCount,
}: {
  provider: SearchProviderChoice;
  /** A képernyőn aktív szűrő — ezt viheti végig a begyűjtés. */
  filters: Record<string, string>;
  /** Hány cím nélküli sor van a szűrt halmazban (valós szám, nem a 2000-es lista). */
  filteredCount: number | null;
  /** A motorválasztó ugyanazt az értéket állítja, mint a fejlécben lévő. */
  onProviderChange: (next: SearchProviderChoice) => void;
  onFinished: () => void;
  /** Jelzés a szülőnek, ha a futás elindult vagy leállt. */
  onActiveChange?: (active: boolean) => void;
}) {
  const [state, setState] = useState<SweepState | null>(null);
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(25);
  // Egyszerre hány cégen dolgozzon. Mindig ennyi fut: ha egy végez, jön a
  // következő. Fölfelé a gép memóriája a korlát (CLI-nként 400-700 MB).
  const [concurrency, setConcurrency] = useState(1);
  const [skipSearched, setSkipSearched] = useState(true);
  const [useFilters, setUseFilters] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/contacts/sweep-emails", {
        cache: "no-store",
      });
      if (response.ok) setState((await response.json()) as SweepState);
    } catch {
      // a lekérdezés hibája nem érdekes: a következő kör újrapróbálja
    }
  }, []);

  // Csak futás közben pollolunk; nyugalomban induláskor és fókuszváltáskor
  // kérdezünk rá egyszer (useStatusPoll).
  const active = state?.status === "running" || state?.status === "stopping";
  useReportActive(active, onActiveChange);
  useStatusPoll(refresh, active, 2000);
  // A futó sorok eltelt ideje másodpercenként frissül.
  const now = useNow(active);

  // A szerver "kész" állapota megmarad a futás után is, a szülő visszahívása
  // viszont minden rendereléskor új függvény. A kettő együtt önmagát hajtó
  // ciklust adott (újratöltés → render → új visszahívás → újratöltés), ezért a
  // visszahívást refben tartjuk, és csak a tényleges állapotváltásnál jelzünk.
  const finishCallback = useRef(onFinished);
  useEffect(() => {
    finishCallback.current = onFinished;
  });

  const seenStatus = useRef<string | null>(null);
  useEffect(() => {
    const status = state?.status ?? null;
    const previous = seenStatus.current;
    seenStatus.current = status;
    // Az első lekérdezés csak alapállapot: a "kész" lehet egy korábbi futásé.
    if (previous && previous !== "done" && status === "done") {
      finishCallback.current();
    }
  }, [state?.status]);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/contacts/sweep-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hiba");
      setState(data as SweepState);
      setOpen(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const percent =
    state && state.total > 0
      ? Math.round((state.processed / state.total) * 100)
      : 0;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <button
          type="button"
          disabled={busy || active}
          onClick={() =>
            void send({
              action: "start",
              provider,
              limit,
              skipSearched,
              concurrency,
              delayMs: 3000,
              filters: useFilters ? filters : {},
            })
          }
          className="h-9 rounded-lg bg-cyan-600 px-4 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:opacity-40"
        >
          {active ? "Fut…" : "🔎 Összes hiányzó e-mail begyűjtése"}
        </button>

        {active ? (
          <button
            type="button"
            disabled={busy || state?.status === "stopping"}
            onClick={() => void send({ action: "stop" })}
            className="h-9 rounded-lg border border-red-500/60 px-3 text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
          >
            {state?.status === "stopping" ? "Leáll…" : "Leállítás"}
          </button>
        ) : (
          <>
            <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              Hány cég:
              <input
                type="number"
                min={0}
                max={5000}
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
                className="h-8 w-20 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm text-foreground outline-none focus:border-cyan-500"
              />
              <span>(0 = mind)</span>
            </label>
            <label
              className="flex items-center gap-1.5 text-xs text-[var(--muted)]"
              title="Ennyi cégen dolgozik egyszerre, és amint egy végez, indul a következő — mindig ennyi fut. Egy keresés 400-700 MB memóriát eszik, ezért 3-4 fölé csak erős gépen érdemes menni."
            >
              Egyszerre:
              <select
                value={concurrency}
                onChange={(event) => setConcurrency(Number(event.target.value))}
                className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm text-foreground outline-none focus:border-cyan-500"
              >
                {[1, 2, 3, 4, 6, 8].map((value) => (
                  <option key={value} value={value}>
                    {value} szál
                  </option>
                ))}
              </select>
            </label>
            <label
              className="flex items-center gap-1.5 text-xs text-[var(--muted)]"
              title="Csak azokon megy végig, amiket a lista szűrője mutat."
            >
              <input
                type="checkbox"
                checked={useFilters}
                onChange={(event) => setUseFilters(event.target.checked)}
                className="size-4 accent-cyan-500"
              />
              csak a szűrt lista
              {useFilters && filteredCount !== null
                ? ` (${formatNumber(filteredCount)} cím nélkül)`
                : ""}
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={skipSearched}
                onChange={(event) => setSkipSearched(event.target.checked)}
                className="size-4 accent-cyan-500"
              />
              amit már kerestem, kihagyom
            </label>
          </>
        )}

        <span className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
          motor:
          <span className="flex shrink-0 overflow-hidden rounded-lg border border-[var(--border)]">
            {(
              [
                ["openai", "OpenAI"],
                ["claude", "Claude"],
                ["codex", "Codex"],
              ] as [SearchProviderChoice, string][]
            ).map(([value, name]) => (
              <button
                key={value}
                type="button"
                disabled={active}
                onClick={() => onProviderChange(value)}
                title={PROVIDER_LABELS[value]}
                className={`h-8 px-2 text-xs transition disabled:opacity-40 ${
                  provider === value
                    ? "bg-cyan-600 text-white"
                    : "text-[var(--muted)] hover:text-foreground"
                }`}
              >
                {name}
              </button>
            ))}
          </span>
          {(state?.concurrency ?? concurrency) > 1
            ? ` · ${state?.concurrency ?? concurrency} szálon halad`
            : " · egyesével halad"}
        </span>

        <Link
          href="/debug"
          target="_blank"
          className="ml-auto text-xs text-cyan-400 hover:underline"
        >
          konzol megnyitása ↗
        </Link>

        {state && state.processed > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs transition hover:border-cyan-500"
          >
            {open ? "Részletek elrejtése" : "Részletek"}
          </button>
        ) : null}
      </div>

      {error ? <p className="px-3 pb-2 text-xs text-red-300">{error}</p> : null}

      {state && (active || state.processed > 0 || state.status === "error") ? (
        <div className="space-y-2 border-t border-[var(--border)] p-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">
              {formatNumber(state.processed)}/{formatNumber(state.total)}
            </span>
            <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
              {state.scope === "kijelolt"
                ? "kijelölt sorok"
                : state.scope === "szurt"
                  ? "szűrt lista"
                  : "teljes adatbázis"}
              {state.candidates && state.candidates > state.total
                ? ` · ${formatNumber(state.candidates)} lehetségesből`
                : ""}
            </span>
            <div className="h-2 min-w-[160px] flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full bg-cyan-500 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-xs text-[var(--muted)]">
              {state.concurrency > 1 ? `${state.concurrency} szálon · ` : ""}
              {formatNumber(state.found)} cím · {formatNumber(state.filled)}{" "}
              beírva
              {state.failed ? ` · ${state.failed} hiba` : ""}
              {active ? ` · hátra: ${humanTime(state.etaSeconds)}` : ""}
            </span>
          </div>

          {state.current ? (
            <p className="text-xs text-cyan-300">
              <span className="animate-pulse">●</span> most: {state.current}
            </p>
          ) : null}

          <RunMessage
            status={state.status}
            message={state.message}
            scope="sweep"
          />

          {open ? (
            <div className="max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 font-mono text-[11px]">
              {/* Felül, amin épp dolgozunk — készültekor a helyére kerül az
                  eredmény, és a következő indulónak adja át a helyét. */}
              {(state.active ?? []).map((item) => (
                <div
                  key={`fut-${item.company}`}
                  className="flex flex-wrap items-center gap-2 border-b border-[var(--border)]/40 py-1"
                >
                  <span className="flex min-w-[220px] items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block size-3 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent"
                    />
                    {item.company}
                  </span>
                  <span className="text-cyan-200">keresés…</span>
                  <span className="ml-auto text-[var(--muted)] tabular-nums">
                    {now
                      ? `${Math.max(0, Math.round((now - new Date(item.startedAt).getTime()) / 1000))} mp`
                      : "—"}
                  </span>
                </div>
              ))}

              {state.recent.map((item, index) => (
                <div
                  key={`${item.company}-${index}`}
                  className="flex flex-wrap items-center gap-2 border-b border-[var(--border)]/40 py-1"
                >
                  <span className="min-w-[220px]">{item.company}</span>
                  {item.error ? (
                    <span className="text-red-400">
                      hiba: {item.error.slice(0, 80)}
                    </span>
                  ) : (
                    <>
                      <span className="text-cyan-200">{item.email ?? "—"}</span>
                      {item.email ? (
                        <span className="text-[var(--muted)]">
                          {item.confidence}
                        </span>
                      ) : null}
                      {item.filled ? (
                        <span className="text-emerald-400">beírva</span>
                      ) : item.email ? (
                        <span className="text-amber-300">javaslat</span>
                      ) : null}
                    </>
                  )}
                  <span className="ml-auto text-[var(--muted)]">
                    {(item.ms / 1000).toFixed(1)} mp
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
