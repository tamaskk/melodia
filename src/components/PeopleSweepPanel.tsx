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

interface PeopleItem {
  company: string;
  contactId: string;
  people: number;
  hr: number;
  leaders: number;
  first: string | null;
  ms: number;
  error?: string;
}

interface PeopleSweepState {
  status: "idle" | "running" | "stopping" | "done" | "error";
  provider: string;
  total: number;
  processed: number;
  found: number;
  peopleTotal: number;
  failed: number;
  current: string | null;
  scope?: "adatbazis" | "kijelolt" | "szurt";
  candidates?: number;
  /** Amin épp dolgozunk — töltés-jelzős sorok a lista tetején. */
  active?: { company: string; startedAt: string }[];
  /** Egyszerre hány cégen dolgozik. */
  concurrency?: number;
  etaSeconds: number | null;
  message: string | null;
  recent: PeopleItem[];
}

function humanTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  if (seconds < 90) return `${seconds} mp`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} perc`;
  return `${(minutes / 60).toFixed(1)} óra`;
}

/**
 * Kapcsolattartó-begyűjtés: kinél érdemes jelentkezni.
 *
 * Ugyanaz a doboz, mint az e-mail begyűjtésnél, csak mást keres: HR-est és
 * vezetőt. A futás a szerveren él, ez csak nézi és megállítja.
 */
export default function PeopleSweepPanel({
  provider,
  onProviderChange,
  onFinished,
  onActiveChange,
  filters,
  selectedIds,
}: {
  provider: SearchProviderChoice;
  filters: Record<string, string>;
  /** Ha van kijelölés, azokon megy végig — különben a szűrt listán. */
  selectedIds: string[];
  onProviderChange: (next: SearchProviderChoice) => void;
  onFinished: () => void;
  /** Jelzés a szülőnek, ha a futás elindult vagy leállt. */
  onActiveChange?: (active: boolean) => void;
}) {
  const [state, setState] = useState<PeopleSweepState | null>(null);
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(25);
  // Egyszerre hány cégen dolgozzon (CLI-nként 400-700 MB memória).
  const [concurrency, setConcurrency] = useState(1);
  const [skipSearched, setSkipSearched] = useState(true);
  const [useFilters, setUseFilters] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/contacts/sweep-people", {
        cache: "no-store",
      });
      if (response.ok) setState((await response.json()) as PeopleSweepState);
    } catch {
      // a következő kör újrapróbálja
    }
  }, []);

  // Csak futás közben pollolunk; nyugalomban induláskor és fókuszváltáskor
  // kérdezünk rá egyszer (useStatusPoll).
  const active = state?.status === "running" || state?.status === "stopping";
  useReportActive(active, onActiveChange);
  useStatusPoll(refresh, active, 2000);
  // A futó sorok eltelt ideje másodpercenként frissül.
  const now = useNow(active);

  // A szülő visszahívása rendernként új: refben tartjuk, és csak a tényleges
  // állapotváltásnál jelzünk — különben önmagát hajtó ciklus lenne belőle.
  const finishCallback = useRef(onFinished);
  useEffect(() => {
    finishCallback.current = onFinished;
  });

  const seenStatus = useRef<string | null>(null);
  useEffect(() => {
    const status = state?.status ?? null;
    const previous = seenStatus.current;
    seenStatus.current = status;
    if (previous && previous !== "done" && status === "done")
      finishCallback.current();
  }, [state?.status]);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/contacts/sweep-people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hiba");
      setState(data as PeopleSweepState);
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
              concurrency,
              skipSearched,
              delayMs: 3000,
              ...(selectedIds.length
                ? { ids: selectedIds }
                : { filters: useFilters ? filters : {} }),
            })
          }
          className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-40"
        >
          {active
            ? "Fut…"
            : selectedIds.length
              ? `👤 Kapcsolattartók keresése (${formatNumber(selectedIds.length)})`
              : "👤 Kapcsolattartók keresése (HR + vezetés)"}
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
                disabled={selectedIds.length > 0}
                className="h-8 w-20 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm text-foreground outline-none focus:border-violet-500 disabled:opacity-40"
              />
              <span>(0 = mind)</span>
            </label>
            <label
              className="flex items-center gap-1.5 text-xs text-[var(--muted)]"
              title="Ennyi cégen dolgozik egyszerre, és amint egy végez, indul a következő. Egy keresés 400-700 MB memóriát eszik."
            >
              Egyszerre:
              <select
                value={concurrency}
                onChange={(event) => setConcurrency(Number(event.target.value))}
                className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm text-foreground outline-none focus:border-violet-500"
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
                disabled={selectedIds.length > 0}
                className="size-4 accent-violet-500"
              />
              csak a szűrt lista
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={skipSearched}
                onChange={(event) => setSkipSearched(event.target.checked)}
                className="size-4 accent-violet-500"
              />
              amit már kerestem, kihagyom
            </label>
          </>
        )}

        <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          motor:
          <span className="flex overflow-hidden rounded-lg border border-[var(--border)]">
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
                    ? "bg-violet-600 text-white"
                    : "text-[var(--muted)] hover:text-foreground"
                }`}
              >
                {name}
              </button>
            ))}
          </span>
          · HR-t keres, ha nincs, akkor vezetőt
          {(state?.concurrency ?? concurrency) > 1
            ? ` · ${state?.concurrency ?? concurrency} szálon halad`
            : " · egyesével halad"}
        </span>

        <Link
          href="/debug"
          target="_blank"
          className="ml-auto text-xs text-violet-400 hover:underline"
        >
          konzol megnyitása ↗
        </Link>

        {state && state.processed > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs transition hover:border-violet-500"
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
                className="h-full rounded-full bg-violet-500 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-xs text-[var(--muted)]">
              {(state.concurrency ?? 1) > 1
                ? `${state.concurrency} szálon · `
                : ""}
              {formatNumber(state.found)} cégnél ·{" "}
              {formatNumber(state.peopleTotal)} fő
              {state.failed ? ` · ${state.failed} hiba` : ""}
              {active ? ` · hátra: ${humanTime(state.etaSeconds)}` : ""}
            </span>
          </div>

          {state.current ? (
            <p className="text-xs text-violet-300">
              <span className="animate-pulse">●</span> most: {state.current}
            </p>
          ) : null}
          <RunMessage
            status={state.status}
            message={state.message}
            scope="emberek"
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
                      className="inline-block size-3 animate-spin rounded-full border-2 border-violet-400 border-t-transparent"
                    />
                    {item.company}
                  </span>
                  <span className="text-violet-200">keresés…</span>
                  <span className="ml-auto text-[var(--muted)] tabular-nums">
                    {now
                      ? `${Math.max(0, Math.round((now - new Date(item.startedAt).getTime()) / 1000))} mp`
                      : "—"}
                  </span>
                </div>
              ))}

              {state.recent.map((item, index) => (
                <div
                  key={`${item.contactId}-${index}`}
                  className="flex flex-wrap items-center gap-2 border-b border-[var(--border)]/40 py-1"
                >
                  <span className="min-w-[190px]">{item.company}</span>
                  {item.error ? (
                    <span className="text-red-400">
                      hiba: {item.error.slice(0, 70)}
                    </span>
                  ) : item.people ? (
                    <>
                      <span className="text-violet-200">
                        {item.people} fő ({item.hr} HR, {item.leaders} vezetés)
                      </span>
                      {item.first ? (
                        <span className="text-[var(--muted)]">
                          {item.first}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-[var(--muted)]">
                      nem találtam embert
                    </span>
                  )}
                  <span className="text-[var(--muted)]">
                    {Math.round(item.ms / 1000)} mp
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
