"use client";

import { useCallback, useEffect, useState } from "react";
import { formatNumber } from "@/lib/format";

interface Bucket {
  key: string;
  searches: number;
  found: number;
  tokens: number;
  costUsd: number;
  ms: number;
}

interface Entry {
  at: string;
  company: string;
  contactId: string | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd: number | null;
  ms: number;
  turns: number | null;
  webSearch: number | null;
  webFetch: number | null;
  found: boolean;
  origin: string;
}

interface Summary {
  days: number;
  from: string;
  to: string;
  totals: Bucket;
  byModel: Bucket[];
  byDay: Bucket[];
  byOrigin: Bucket[];
  recent: Entry[];
}

const ORIGIN_LABELS: Record<string, string> = {
  kezi: "kézi keresés",
  sweep: "automatikus begyűjtés",
  felvetel: "felvétel + kutatás",
};

function num(value: number): string {
  return formatNumber(value);
}

function tokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1000)}k`;
  return String(value);
}

function clock(iso: string): string {
  return new Date(iso).toLocaleString("hu", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Token-felhasználás: mennyibe kerül egy e-mail keresés, és mi viszi el a keretet.
 *
 * Motoronként és modellenként bontva, mert a mérés szerint ugyanaz a keresés
 * Opusszal 226 ezer, Sonnettel nagyságrenddel kevesebb tokent visz el.
 */
/** ÉÉÉÉ-HH-NN alak a mai naphoz képest eltolva. */
function isoDay(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Fájl letöltése a böngészőből — nincs hozzá szerver. */
function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** CSV-mező: idézőjelezve, hogy a vessző és az idézőjel se törje el. */
function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export default function UsagePanel() {
  const [from, setFrom] = useState(isoDay(29));
  const [to, setTo] = useState(isoDay(0));
  const [exporting, setExporting] = useState(false);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/usage?from=${from}&to=${to}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Betöltési hiba");
      setData(payload as Summary);
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 100);
    return () => clearTimeout(timer);
  }, [load]);

  const stamp = (a: string, b: string) => (a === b ? a : `${a}_${b}`);

  /**
   * Tételes export: minden keresés külön sorban. A felületen látható 50 helyett
   * az időszak **összes** tételét lekérjük (`entries=1`). Egy nap exportjához
   * a `day` paraméter mindkét határt megadja.
   */
  const exportEntries = async (format: "csv" | "json", day?: string) => {
    setExporting(true);
    setError(null);
    try {
      const start = day ?? from;
      const end = day ?? to;
      const response = await fetch(
        `/api/usage?from=${start}&to=${end}&entries=1`,
        {
          cache: "no-store",
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Export hiba");
      const entries = (payload.entries ?? []) as Entry[];

      if (format === "json") {
        download(
          `token-tetelek-${stamp(start, end)}.json`,
          JSON.stringify(entries, null, 2),
          "application/json",
        );
        return;
      }

      const header = [
        "idopont",
        "ceg",
        "contactId",
        "motor",
        "modell",
        "honnan",
        "talalt",
        "osszes_token",
        "input",
        "output",
        "cache_iras",
        "cache_olvasas",
        "koltseg_usd",
        "korok",
        "web_kereses",
        "web_letoltes",
        "ms",
      ];
      const lines = entries.map((entry) =>
        [
          entry.at,
          entry.company,
          entry.contactId,
          entry.provider,
          entry.model,
          entry.origin,
          entry.found ? "igen" : "nem",
          entry.totalTokens,
          entry.inputTokens,
          entry.outputTokens,
          entry.cacheWriteTokens,
          entry.cacheReadTokens,
          entry.costUsd ?? "",
          entry.turns ?? "",
          entry.webSearch ?? "",
          entry.webFetch ?? "",
          entry.ms,
        ]
          .map(cell)
          .join(","),
      );
      download(
        `token-tetelek-${stamp(start, end)}.csv`,
        [header.join(","), ...lines].join("\n"),
        "text/csv;charset=utf-8",
      );
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setExporting(false);
    }
  };

  /** Napi összesítő: naponta egy sor, a már betöltött adatból. */
  const exportDaily = () => {
    const rows = data?.byDay ?? [];
    const header = [
      "nap",
      "kereses",
      "talalat",
      "osszes_token",
      "atlag_token",
      "koltseg_usd",
      "ossz_masodperc",
    ];
    const lines = rows.map((day) =>
      [
        day.key,
        day.searches,
        day.found,
        day.tokens,
        Math.round(day.tokens / Math.max(1, day.searches)),
        day.costUsd.toFixed(4),
        Math.round(day.ms / 1000),
      ]
        .map(cell)
        .join(","),
    );
    download(
      `token-napi-${stamp(from, to)}.csv`,
      [header.join(","), ...lines].join("\n"),
      "text/csv;charset=utf-8",
    );
  };

  const totals = data?.totals;
  const perSearch = totals?.searches
    ? Math.round(totals.tokens / totals.searches)
    : 0;
  const perFound = totals?.found ? Math.round(totals.tokens / totals.found) : 0;
  const peak = Math.max(1, ...(data?.byDay ?? []).map((day) => day.tokens));

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Token-felhasználás</h1>
          <p className="text-sm text-[var(--muted)]">
            Mennyibe kerül egy e-mail keresés, motoronként és modellenként.
            Minden keresés a saját során is megmarad (`emailSearch.usage`).
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Ettől
          <input
            type="date"
            value={from}
            max={to}
            onChange={(event) => setFrom(event.target.value)}
            className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm text-foreground outline-none focus:border-blue-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Eddig
          <input
            type="date"
            value={to}
            min={from}
            max={isoDay(0)}
            onChange={(event) => setTo(event.target.value)}
            className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm text-foreground outline-none focus:border-blue-500"
          />
        </label>

        <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
          {[
            ["ma", 0],
            ["7 nap", 6],
            ["30 nap", 29],
            ["90 nap", 89],
          ].map(([label, offset]) => {
            const start = isoDay(offset as number);
            const active = from === start && to === isoDay(0);
            return (
              <button
                key={label as string}
                type="button"
                onClick={() => {
                  setFrom(start);
                  setTo(isoDay(0));
                }}
                className={`h-8 px-3 text-xs transition ${
                  active
                    ? "bg-blue-500/15 text-blue-200"
                    : "text-[var(--muted)] hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Export
          </span>
          <button
            type="button"
            disabled={exporting}
            onClick={() => void exportEntries("csv")}
            title="Minden keresés külön sorban, a kiválasztott időszakból"
            className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
          >
            Tételes CSV
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={() => void exportEntries("json")}
            className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs transition hover:border-emerald-500 disabled:opacity-40"
          >
            Tételes JSON
          </button>
          <button
            type="button"
            disabled={exporting || !data?.byDay.length}
            onClick={() => exportDaily()}
            title="Naponta egy sor: keresés, token, költség, idő"
            className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs transition hover:border-emerald-500 disabled:opacity-40"
          >
            Napi összesítő CSV
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {!data || !totals ? (
        <p className="text-sm text-[var(--muted)]">
          {loading ? "Töltés…" : "Még nincs mért keresés."}
        </p>
      ) : totals.searches === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
          Ebben az időszakban nem futott keresés. Indíts egyet a listából, és
          itt azonnal látszik, hány tokenbe került.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ["Keresés", num(totals.searches), ""],
              ["Token összesen", tokens(totals.tokens), "text-blue-300"],
              ["Átlag / keresés", num(perSearch), "text-amber-300"],
              ["Átlag / talált cím", num(perFound), "text-emerald-300"],
              [
                "Költség (viszonyítás)",
                totals.costUsd ? `$${totals.costUsd.toFixed(2)}` : "—",
                "text-[var(--muted)]",
              ],
            ].map(([label, value, tone]) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              >
                <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  {label}
                </p>
                <p className={`text-xl font-semibold tabular-nums ${tone}`}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <header className="border-b border-[var(--border)] px-3 py-2 text-sm font-semibold">
                Motor és modell szerint
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2">Modell</th>
                      <th className="px-3 py-2 text-right">Keresés</th>
                      <th className="px-3 py-2 text-right">Token</th>
                      <th className="px-3 py-2 text-right">Átlag</th>
                      <th className="px-3 py-2 text-right">Találat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byModel.map((row) => (
                      <tr
                        key={row.key}
                        className="border-t border-[var(--border)]/60"
                      >
                        <td className="px-3 py-2 font-mono">{row.key}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.searches}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {tokens(row.tokens)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-300">
                          {num(
                            Math.round(row.tokens / Math.max(1, row.searches)),
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Math.round(
                            (row.found / Math.max(1, row.searches)) * 100,
                          )}
                          %
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <header className="border-b border-[var(--border)] px-3 py-2 text-sm font-semibold">
                Napi fogyás
              </header>
              <div className="space-y-1 p-3">
                {data.byDay.map((day) => (
                  <div
                    key={day.key}
                    className="flex items-center gap-2 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setFrom(day.key);
                        setTo(day.key);
                      }}
                      title="Csak ez a nap"
                      className="w-16 shrink-0 text-left text-[var(--muted)] transition hover:text-blue-300"
                    >
                      {day.key.slice(5).replace("-", ".")}.
                    </button>
                    <div className="h-3 flex-1 overflow-hidden rounded bg-[var(--surface-2)]">
                      <div
                        className="h-full rounded bg-blue-500/70"
                        style={{ width: `${(day.tokens / peak) * 100}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right tabular-nums">
                      {tokens(day.tokens)}
                    </span>
                    <span className="w-10 shrink-0 text-right tabular-nums text-[var(--muted)]">
                      {formatNumber(day.searches)}×
                    </span>
                    <button
                      type="button"
                      disabled={exporting}
                      onClick={() => void exportEntries("csv", day.key)}
                      title={`${day.key} tételes exportja`}
                      className="shrink-0 rounded border border-[var(--border)] px-1.5 text-[11px] text-[var(--muted)] transition hover:border-emerald-500 hover:text-emerald-300 disabled:opacity-40"
                    >
                      ⭳
                    </button>
                  </div>
                ))}
              </div>
              {data.byOrigin.length ? (
                <p className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
                  Honnan:{" "}
                  {data.byOrigin
                    .map(
                      (row) =>
                        `${ORIGIN_LABELS[row.key] ?? row.key} ${tokens(row.tokens)} (${row.searches}×)`,
                    )
                    .join(" · ")}
                </p>
              ) : null}
            </section>
          </div>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <header className="border-b border-[var(--border)] px-3 py-2 text-sm font-semibold">
              Utolsó {data.recent.length} keresés
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-xs">
                <thead className="text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2">Mikor</th>
                    <th className="px-3 py-2">Cég</th>
                    <th className="px-3 py-2">Modell</th>
                    <th className="px-3 py-2 text-right">Token</th>
                    <th className="px-3 py-2 text-right">ebből cache</th>
                    <th className="px-3 py-2 text-right">Kör</th>
                    <th className="px-3 py-2 text-right">Eszköz</th>
                    <th className="px-3 py-2 text-right">Idő</th>
                    <th className="px-3 py-2">Eredmény</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((entry, index) => (
                    <tr
                      key={`${entry.at}-${index}`}
                      className="border-t border-[var(--border)]/60"
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-[var(--muted)]">
                        {clock(entry.at)}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2">
                        {entry.company}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px]">
                        {entry.provider} · {entry.model}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {num(entry.totalTokens)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                        {num(entry.cacheReadTokens + entry.cacheWriteTokens)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {entry.turns ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                        {entry.webSearch ?? 0}/{entry.webFetch ?? 0}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Math.round(entry.ms / 1000)} mp
                      </td>
                      <td className="px-3 py-2">
                        {entry.found ? (
                          <span className="text-emerald-300">cím</span>
                        ) : (
                          <span className="text-[var(--muted)]">nincs</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
