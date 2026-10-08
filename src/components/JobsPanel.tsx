"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";
import {
  BOARD_COLUMNS,
  type BoardItem,
  type BoardJob,
  type BoardStatus,
  type CatalogSource,
  type SearchResponse,
  type SourceRunResult,
} from "@/lib/jobs/types";
import JobAssistPanel from "./JobAssistPanel";
import JobCard from "./JobCard";
import { button, CARD, chip, field } from "./ui";

type View = "list" | "board" | "jobassist";
type SearchResult = Omit<SearchResponse, "jobs"> & { jobs: BoardJob[] };
/** A tábla a kliensben: állás-azonosító → oszlop és a mentett pillanatkép. */
type Board = Record<string, BoardItem>;

const COUNTRIES = ["HU", "DE", "AT", "NL", "ES", "GB", "US"];

const VIEWS: [View, string][] = [
  ["list", "Lista"],
  ["board", "Kanban"],
  ["jobassist", "JobAssist"],
];

const SECTION_LABEL =
  "mr-1 font-mono text-[10px] uppercase tracking-wide text-[var(--muted)]";

const toggled = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/** Egy forrás futásának címkéje: találatszám, kihagyva, hiba vagy tartós hiba. */
function runBadge(run: SourceRunResult): { value: string; tone: string } {
  if (run.skipped) {
    return { value: "—", tone: "border-[var(--border)] text-[var(--muted)]" };
  }
  if (run.ok) {
    return {
      value: String(run.count),
      tone: "border-emerald-500/40 text-emerald-300",
    };
  }
  if (run.alert) {
    return {
      value: "HALOTT",
      tone: "border-red-500 bg-red-500/15 font-semibold text-red-300",
    };
  }
  return { value: "hiba", tone: "border-red-500/40 text-red-300" };
}

/**
 * Munkák: egy keresés minden bekötött álláshirdetés-forrásban, a találatok
 * listában, a megjelöltek hatoszlopos táblán. A harmadik nézet a JobAssist,
 * saját szűrőkkel.
 */
export default function JobsPanel() {
  const [catalog, setCatalog] = useState<CatalogSource[]>([]);
  const [q, setQ] = useState("software engineer");
  const [countries, setCountries] = useState<string[]>([]);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [activeSources, setActiveSources] = useState<string[]>([]);
  const [view, setView] = useState<View>("list");
  // A JobAssist az első megnyitáskor töltődik be, utána megőrzi az állapotát.
  const [assistOpened, setAssistOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<Board>({});
  const [boardError, setBoardError] = useState<string | null>(null);
  // Azok az állások, amelyeknek épp megy a mentése.
  const [saving, setSaving] = useState<string[]>([]);
  const [showSources, setShowSources] = useState(false);
  const [now, setNow] = useState(0);
  // Elavult válasz ne írja felül a frisset.
  const searchRef = useRef(0);

  const loadInitial = useCallback(async () => {
    setNow(Date.now());
    // A katalógus hiánya nem akadály: a kereső nélküle is működik.
    fetch("/api/jobs/sources", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setCatalog((data.sources as CatalogSource[]) ?? []))
      .catch(() => undefined);
    try {
      const response = await fetch("/api/jobs/board", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Betöltési hiba");
      const loaded = Object.fromEntries(
        (data.items as BoardItem[]).map((item) => [item.job.dedupKey, item]),
      );
      // Amit a betöltés alatt már megjelöltek, az marad.
      setBoard((current) => ({ ...loaded, ...current }));
    } catch (caught) {
      setBoardError((caught as Error).message);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void loadInitial(), 0);
    return () => clearTimeout(first);
  }, [loadInitial]);

  const search = async () => {
    const request = ++searchRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q });
      if (countries.length) params.set("countries", countries.join(","));
      if (remoteOnly) params.set("remote", "1");
      if (activeSources.length) params.set("sources", activeSources.join(","));
      const response = await fetch(`/api/jobs/search?${params}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? `HTTP ${response.status}`);
      if (request !== searchRef.current) return;
      setResult(data as SearchResult);
      setNow(Date.now());
    } catch (caught) {
      if (request !== searchRef.current) return;
      setError((caught as Error).message || "Hiba a keresés közben");
      setResult(null);
    } finally {
      if (request === searchRef.current) setLoading(false);
    }
  };

  /**
   * Oszlopváltás. Az aktív státuszra kattintva az állás lekerül a tábláról.
   * A felület azonnal vált; ha a mentés elbukik, visszaáll.
   */
  const setStatus = async (job: BoardJob, status: BoardStatus) => {
    const key = job.dedupKey;
    const previous = board[key];
    const removing = previous?.status === status;
    setBoardError(null);
    // Mentés közben a kártya gombjai állnak: két egymást előző kérés
    // különben mást hagyna a szerveren, mint amit a felület mutat.
    setSaving((current) => [...current, key]);
    setBoard((current) => {
      const next = { ...current };
      if (removing) delete next[key];
      else next[key] = { status, job };
      return next;
    });
    try {
      const response = await fetch("/api/jobs/board", {
        method: removing ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(removing ? { dedupKey: key } : { job, status }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
    } catch (caught) {
      setBoard((current) => {
        const next = { ...current };
        if (previous) next[key] = previous;
        else delete next[key];
        return next;
      });
      setBoardError(`Nem sikerült menteni: ${(caught as Error).message}`);
    } finally {
      setSaving((current) => current.filter((item) => item !== key));
    }
  };

  const openView = (next: View) => {
    setView(next);
    if (next === "jobassist") setAssistOpened(true);
  };

  const enabled = catalog.filter((source) => source.enabled);
  const sourceNames = Object.fromEntries(
    catalog.map((source) => [source.id, source.name]),
  );
  const jobs = result?.jobs ?? [];
  const savedCount = Object.keys(board).length;

  // Tartós hiba: a forrás sokadszorra bukik, valószínűleg megváltozott az API.
  const dead = (result?.sources ?? []).filter((run) => run.alert);
  const deadIds = new Set(dead.map((run) => run.sourceId));
  const fallbacks = catalog.filter((source) =>
    source.fallbackFor?.some((id) => deadIds.has(id)),
  );
  // Forrásmegjelölés: csak azoké, amelyek ebben a keresésben találatot adtak.
  const hits = new Set(
    (result?.sources ?? [])
      .filter((run) => run.count > 0)
      .map((run) => run.sourceId),
  );
  const attributions = catalog.flatMap((source) =>
    source.attribution && hits.has(source.id) ? [source.attribution] : [],
  );

  // A táblán a friss találat írja felül a mentett pillanatképet.
  const fresh = new Map(jobs.map((job) => [job.dedupKey, job]));
  const boardItems = Object.values(board);

  const searching = view !== "jobassist";

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4 pb-24 sm:p-6 sm:pb-24">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Munkák</h1>
          <p className="text-sm text-[var(--muted)]">
            Egy keresés, minden bekötött forrás.{" "}
            <button
              type="button"
              aria-expanded={showSources}
              onClick={() => setShowSources((shown) => !shown)}
              className="underline decoration-dotted underline-offset-2 hover:text-blue-300"
            >
              {enabled.length}/{catalog.length} forrás aktív
            </button>
          </p>
        </div>
        <div className="flex max-w-full gap-1 rounded-lg border border-[var(--border)] p-0.5">
          {VIEWS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => openView(value)}
              className={`h-8 whitespace-nowrap rounded-md px-3 text-sm transition ${
                view === value
                  ? "bg-[var(--surface-2)] text-foreground"
                  : "text-[var(--muted)] hover:text-foreground"
              }`}
            >
              {label}
              {value === "board" && savedCount ? ` (${savedCount})` : ""}
            </button>
          ))}
        </div>
      </header>

      {showSources ? (
        <section className={`${CARD} overflow-hidden`}>
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead className="sticky top-0 bg-[var(--surface-2)] text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Forrás</th>
                  <th className="px-3 py-2 font-medium">Lefedettség</th>
                  <th className="px-3 py-2 font-medium">Állapot</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((source) => (
                  <tr
                    key={source.id}
                    className="border-t border-[var(--border)] align-top"
                  >
                    <td className="px-3 py-2">
                      <a
                        href={source.docs}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline"
                      >
                        {source.name}
                      </a>
                      {source.warning ? (
                        <p className="text-[11px] leading-snug text-amber-300">
                          {source.warning}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">
                      {source.regions}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">
                      {source.enabled ? (
                        <span className="text-emerald-300">aktív</span>
                      ) : (
                        <span className="text-[var(--muted)]">
                          kell: {source.missingEnv.join(", ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {boardError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300"
        >
          {boardError}
        </p>
      ) : null}

      {searching ? (
        <>
          <section className={`${CARD} p-3`}>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void search();
              }}
            >
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                aria-label="Keresőszó"
                placeholder={'Pl. software engineer, react, "senior backend"'}
                className={`${field()} min-w-0 flex-1`}
              />
              <button
                type="submit"
                disabled={loading}
                className={button("primary", "md")}
              >
                {loading ? "Keresés…" : "Keresés"}
              </button>
            </form>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className={SECTION_LABEL}>Ország</span>
              {COUNTRIES.map((country) => (
                <button
                  key={country}
                  type="button"
                  aria-pressed={countries.includes(country)}
                  onClick={() =>
                    setCountries((current) => toggled(current, country))
                  }
                  className={chip(countries.includes(country))}
                >
                  {country}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={remoteOnly}
                onClick={() => setRemoteOnly((on) => !on)}
                className={`${chip(remoteOnly)} sm:ml-2`}
              >
                Csak remote
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={SECTION_LABEL}>Forrás</span>
              <button
                type="button"
                aria-pressed={activeSources.length === 0}
                onClick={() => setActiveSources([])}
                className={chip(activeSources.length === 0)}
              >
                Mind
              </button>
              {enabled.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  aria-pressed={activeSources.includes(source.id)}
                  onClick={() =>
                    setActiveSources((current) => toggled(current, source.id))
                  }
                  className={chip(activeSources.includes(source.id))}
                >
                  {source.name}
                </button>
              ))}
            </div>
          </section>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300"
            >
              {error}
            </p>
          ) : null}

          {result ? (
            <section className="space-y-2">
              <p className="font-mono text-[11px] text-[var(--muted)]">
                {formatNumber(result.totalUnique)} egyedi találat ·{" "}
                {formatNumber(result.totalRaw)} nyers ·{" "}
                {(result.durationMs / 1000).toFixed(1)}s
              </p>

              {dead.length ? (
                <p className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
                  Tartós hiba:{" "}
                  {dead
                    .map(
                      (run) =>
                        `${run.name} (${run.consecutiveFailures} egymást követő futás)`,
                    )
                    .join(" · ")}
                  . Valószínűleg megváltozott vagy megszűnt az API — nézd meg az
                  élő naplót.
                  {fallbacks.length
                    ? ` Tartaléknak ${fallbacks.map((source) => source.name).join(", ")} fut helyette.`
                    : ""}
                </p>
              ) : null}

              {attributions.length ? (
                <p className="text-[11px] text-[var(--muted)]">
                  Források:{" "}
                  {attributions.map((attribution, index) => (
                    <span key={attribution.url}>
                      {index ? " · " : ""}
                      {/* Több forrás feltétele követhető linket ír elő: itt nincs nofollow / noreferrer. */}
                      <a
                        href={attribution.url}
                        target="_blank"
                        rel="noopener"
                        className="underline hover:text-blue-300"
                      >
                        {attribution.label}
                      </a>
                    </span>
                  ))}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-1.5">
                {result.sources.map((run) => {
                  const badge = runBadge(run);
                  return (
                    <span
                      key={run.sourceId}
                      title={run.error ?? `${run.durationMs}ms`}
                      className={`rounded border px-2 py-0.5 font-mono text-[10px] ${badge.tone}`}
                    >
                      {run.name} {badge.value}
                    </span>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {view === "list" ? (
        <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => (
            <JobCard
              key={job.dedupKey}
              job={job}
              status={board[job.dedupKey]?.status ?? null}
              onStatus={(status) => void setStatus(job, status)}
              sourceNames={sourceNames}
              now={now}
              busy={saving.includes(job.dedupKey)}
            />
          ))}
          {!result && !loading ? (
            <p className="col-span-full py-16 text-center text-sm text-[var(--muted)]">
              Írj be egy keresőszót, és nyomj a Keresésre.
            </p>
          ) : null}
          {result && !loading && jobs.length === 0 ? (
            <p className="col-span-full py-16 text-center text-sm text-[var(--muted)]">
              Nincs találat. Próbálj tágabb keresőszót, vagy vedd le az
              ország-szűrőt.
            </p>
          ) : null}
        </section>
      ) : null}

      {view === "board" ? (
        // A tábla vízszintesen görgethető, az oldal maga nem.
        <section className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          <div className="flex min-w-max gap-3">
            {BOARD_COLUMNS.map((column) => {
              const items = boardItems.filter(
                (item) => item.status === column.id,
              );
              return (
                <div key={column.id} className="w-[300px] shrink-0">
                  <div className="mb-2 flex items-baseline justify-between border-b border-[var(--border)] pb-1.5">
                    <h2 className="text-sm font-semibold">{column.label}</h2>
                    <span className="font-mono text-[11px] text-[var(--muted)]">
                      {items.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {items.map((item) => {
                      const job = fresh.get(item.job.dedupKey) ?? item.job;
                      return (
                        <JobCard
                          key={job.dedupKey}
                          job={job}
                          status={column.id}
                          onStatus={(status) => void setStatus(job, status)}
                          sourceNames={sourceNames}
                          now={now}
                          busy={saving.includes(job.dedupKey)}
                          compact
                        />
                      );
                    })}
                    {items.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-[var(--border)] py-6 text-center text-xs text-[var(--muted)]">
                        üres
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {assistOpened ? (
        <div hidden={view !== "jobassist"}>
          <JobAssistPanel />
        </div>
      ) : null}
    </div>
  );
}
