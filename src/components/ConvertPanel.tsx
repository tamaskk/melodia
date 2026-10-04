"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { copyToClipboard } from "@/lib/clipboard";
import { useFileDrop } from "@/lib/useFileDrop";
import { downloadText } from "@/lib/export";
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  type LeadReport,
  type Priority,
} from "@/lib/hunter/types";
import { formatNumber } from "@/lib/format";

interface ConvertResponse {
  reports: LeadReport[];
  unmapped: string[];
  stats: {
    rows: number;
    duplicates: number;
    output: number;
    withEmail: number;
    byPriority: Record<Priority, number>;
  };
  error?: string;
}

const PRIORITY_STYLE: Record<Priority, string> = {
  magas: "bg-emerald-500/20 text-emerald-300",
  kozepes: "bg-amber-500/20 text-amber-300",
  alacsony: "bg-slate-500/20 text-slate-300",
  "nem-celpont": "bg-red-500/20 text-red-300",
};

export default function ConvertPanel() {
  const [csv, setCsv] = useState("");
  const [emails, setEmails] = useState("");
  const [minPriority, setMinPriority] = useState<Priority | "">("");
  const [keepDuplicates, setKeepDuplicates] = useState(false);
  const [result, setResult] = useState<ConvertResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Cégnév → benne van-e már az adatbázisban (importálás előtti ellenőrzés).
  const [known, setKnown] = useState<Record<string, boolean> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const flash = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(null), 2500);
  };

  // Az újak kerülnek előre, a már meglévők alájuk.
  const reports = result
    ? [...result.reports].sort(
        (a, b) =>
          Number(known?.[a.lead.company] ?? false) -
          Number(known?.[b.lead.company] ?? false),
      )
    : [];
  const newCount = known
    ? reports.filter((report) => !known[report.lead.company]).length
    : null;
  const existingCount = known
    ? reports.filter((report) => known[report.lead.company]).length
    : null;

  const json = result
    ? JSON.stringify(
        reports.map((r) => r.lead),
        null,
        2,
      )
    : "";

  const convert = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv,
          emails,
          minPriority: minPriority || undefined,
          keepDuplicates,
        }),
      });
      const data = (await response.json()) as ConvertResponse;
      if (!response.ok) throw new Error(data.error ?? "Konvertálási hiba");
      setResult(data);
      void checkDuplicates(data);
      flash(
        `${data.stats.output} sor készen áll (${data.stats.rows} beolvasva, ${data.stats.duplicates} ismétlődő).`,
      );
      setTimeout(
        () =>
          resultRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        50,
      );
    } catch (caught) {
      setError((caught as Error).message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Importálás ELŐTT megkérdezzük a szervert, mely cégek vannak már bent.
   * Nem ír semmit — csak az előnézetet kéri, és abból jelöljük a sorokat.
   */
  const checkDuplicates = async (data: ConvertResponse) => {
    setKnown(null);
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "preview",
          json: JSON.stringify(data.reports.map((report) => report.lead)),
        }),
      });
      const preview = (await response.json()) as {
        preview?: { company: string; exists: boolean }[];
      };
      if (!preview.preview) return;
      setKnown(
        Object.fromEntries(
          preview.preview.map((row) => [row.company, row.exists]),
        ),
      );
    } catch {
      // Az ellenőrzés hibája nem blokkol: az import úgyis újra megnézi.
    }
  };

  const importToDatabase = async () => {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // A CSV-ből generált sorokban nincs e-mail: meglévő céget soha nem írunk felül.
        body: JSON.stringify({ mode: "apply", json, skipExisting: true }),
      });
      const data = (await response.json()) as {
        applied?: boolean;
        newCount?: number;
        updateCount?: number;
        skippedCount?: number;
        errors?: { company: string; field: string; message: string }[];
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      if (!data.applied) {
        const first = data.errors?.[0];
        throw new Error(
          `Nem importáltam: ${data.errors?.length ?? 0} hiba${
            first
              ? ` — ${first.company}: ${first.field} · ${first.message}`
              : ""
          }`,
        );
      }
      flash(
        `Importálva: ${data.newCount} új cég` +
          (data.skippedCount
            ? ` · ${data.skippedCount} meglévőt nem írtam felül`
            : ""),
      );
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const loadFile = async (file: File, target: "csv" | "emails") => {
    if (!/\.(csv|txt|json)$/i.test(file.name)) {
      setError(
        `Ezt a fájltípust nem tudom beolvasni: ${file.name} (.csv kell).`,
      );
      return;
    }
    const text = await file.text();
    if (target === "csv") setCsv(text);
    else setEmails(text);
    setResult(null);
    setError(null);
    flash(
      `${file.name} beolvasva (${formatNumber(text.length)} karakter, ` +
        `${text.split("\n").length - 1} sor).`,
    );
  };

  const csvDrop = useFileDrop((file) => loadFile(file, "csv"));
  const emailDrop = useFileDrop((file) => loadFile(file, "emails"));

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Hunter CSV → lead JSON</h1>
          <p className="max-w-2xl text-sm text-[var(--muted)]">
            Hunter.io cégexportból pontozott, levélszöveggel együtt kész lead
            JSON-t készít. Kulcsszavas szabályok adják a prioritást, a levél
            közepébe a cég profiljához illő horgony kerül.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/import"
            className="h-9 rounded-lg border border-[var(--border)] px-3 text-sm leading-9 transition hover:border-blue-500"
          >
            Import
          </Link>
        </div>
      </header>

      <section
        {...csvDrop.dropProps}
        className={`relative space-y-2 rounded-xl border bg-[var(--surface)] p-4 transition ${
          csvDrop.dragging
            ? "border-blue-500 bg-blue-500/5 ring-2 ring-blue-500/40"
            : "border-[var(--border)]"
        }`}
      >
        {csvDrop.dragging ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[var(--background)]/80 text-sm font-medium text-blue-300">
            Engedd el — beolvasom a CSV-t
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
            Hunter CSV
          </h2>
          <input
            ref={fileInput}
            type="file"
            accept="text/csv,.csv,.txt"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file, "csv");
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs transition hover:border-blue-500"
          >
            Fájl feltöltése
          </button>
          <span className="text-xs text-[var(--muted)]">
            vagy húzd ide a fájlt
          </span>
          <button
            type="button"
            onClick={() => {
              setCsv("");
              setResult(null);
            }}
            className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs text-[var(--muted)] transition hover:text-foreground"
          >
            Ürítés
          </button>
          <span className="ml-auto text-xs text-[var(--muted)]">
            {formatNumber(csv.length)} karakter
          </span>
        </div>

        <textarea
          value={csv}
          onChange={(event) => {
            setCsv(event.target.value);
            setResult(null);
          }}
          spellCheck={false}
          placeholder={
            "Húzd ide a CSV-t, vagy illeszd be:\n\n" +
            "Company Name,Domain,City,Country,Industry,Headcount,Company Type,Tags,Linkedin,Description"
          }
          className="min-h-[200px] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 font-mono text-xs leading-relaxed outline-none focus:border-blue-500"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <label
            {...emailDrop.dropProps}
            className={`flex flex-col gap-1 rounded-lg transition ${
              emailDrop.dragging ? "ring-2 ring-blue-500/40" : ""
            }`}
          >
            <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
              Ismert e-mailek (domain,email CSV vagy JSON) — ide is húzhatsz
              fájlt
            </span>
            <textarea
              value={emails}
              onChange={(event) => {
                setEmails(event.target.value);
                setResult(null);
              }}
              spellCheck={false}
              placeholder={
                "regens.com,hr@regens.com\ndyrector.io,jobs@dyrector.io"
              }
              className="min-h-[90px] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 font-mono text-[11px] outline-none focus:border-blue-500"
            />
          </label>

          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                Minimum prioritás
              </span>
              <select
                value={minPriority}
                onChange={(event) => {
                  setMinPriority(event.target.value as Priority | "");
                  setResult(null);
                }}
                className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="">Mind (a nem célpontokkal együtt)</option>
                {PRIORITY_ORDER.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]} és jobb
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={keepDuplicates}
                onChange={(event) => {
                  setKeepDuplicates(event.target.checked);
                  setResult(null);
                }}
                className="size-4 accent-blue-500"
              />
              Ismétlődő domaineket megtartom (megjelölve a note-ban)
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || csv.trim().length === 0}
            onClick={() => void convert()}
            className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
          >
            {busy ? "Feldolgozás…" : "Konvertálás"}
          </button>
          {status ? (
            <span className="text-xs text-emerald-400">{status}</span>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : null}
      </section>

      {result ? (
        <section
          ref={resultRef}
          className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">{result.stats.output} lead</span>
            <span className="text-[var(--muted)]">
              {result.stats.rows} beolvasott sor · {result.stats.duplicates}{" "}
              ismétlődő
              {keepDuplicates ? " (megtartva)" : " (eldobva)"} ·{" "}
              {formatNumber(result.stats.withEmail)} e-maillel
            </span>
            {known ? (
              <span className="rounded-lg bg-[var(--surface-2)] px-2 py-1 text-xs">
                <span className="text-emerald-300">{formatNumber(newCount ?? 0)} új</span>
                {" · "}
                <span className="text-blue-300">
                  {formatNumber(existingCount ?? 0)} már bent van
                </span>
              </span>
            ) : (
              <span className="text-xs text-[var(--muted)]">
                duplikáció-ellenőrzés fut…
              </span>
            )}

            <div className="ml-auto flex flex-wrap gap-1.5">
              {PRIORITY_ORDER.map((priority) => (
                <span
                  key={priority}
                  className={`rounded-full px-2 py-0.5 text-[11px] ${PRIORITY_STYLE[priority]}`}
                >
                  {PRIORITY_LABELS[priority]}:{" "}
                  {result.stats.byPriority[priority]}
                </span>
              ))}
            </div>
          </div>

          {result.unmapped.length ? (
            <p className="text-xs text-[var(--muted)]">
              Leképezetlen oszlop: {result.unmapped.join(", ")}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                await copyToClipboard(json);
                flash("JSON a vágólapon.");
              }}
              className="h-9 rounded-lg border border-[var(--border)] px-3 text-sm transition hover:border-blue-500"
            >
              JSON másolása
            </button>
            <button
              type="button"
              onClick={() => {
                downloadText(json, "leads.json", "application/json");
                flash("leads.json letöltve.");
              }}
              className="h-9 rounded-lg border border-[var(--border)] px-3 text-sm transition hover:border-blue-500"
            >
              Letöltés (leads.json)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void importToDatabase()}
              className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              Importálás az adatbázisba
            </button>
          </div>

          <div className="max-h-[540px] overflow-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-[var(--surface-2)] text-[11px] uppercase tracking-wider text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2">Cég</th>
                  <th className="px-3 py-2">Adatbázis</th>
                  <th className="px-3 py-2">Prioritás</th>
                  <th className="px-3 py-2">Pont</th>
                  <th className="px-3 py-2">Méret</th>
                  <th className="px-3 py-2">Nyelv</th>
                  <th className="px-3 py-2">E-mail</th>
                  <th className="px-3 py-2">Címkék</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr
                    key={report.domain + report.lead.company}
                    onClick={() =>
                      setOpen((current) =>
                        current === report.domain ? null : report.domain,
                      )
                    }
                    className="cursor-pointer border-t border-[var(--border)] align-top hover:bg-[var(--surface-2)]"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{report.lead.company}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {report.domain}
                      </div>
                      {open === report.domain ? (
                        <div className="mt-2 space-y-2 text-xs">
                          {report.flags.map((flag, index) => (
                            <p
                              key={index}
                              className={
                                flag.severity === "warn"
                                  ? "text-amber-300"
                                  : "text-[var(--muted)]"
                              }
                            >
                              {flag.text}
                            </p>
                          ))}
                          <pre className="whitespace-pre-wrap rounded-lg bg-[var(--surface-2)] p-2 text-[11px] leading-relaxed">
                            {report.lead.emailSubject}
                            {"\n\n"}
                            {report.lead.emailBody}
                          </pre>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {known ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] ${
                            known[report.lead.company]
                              ? "bg-blue-500/20 text-blue-300"
                              : "bg-emerald-500/20 text-emerald-300"
                          }`}
                        >
                          {known[report.lead.company] ? "már bent" : "új"}
                        </span>
                      ) : (
                        <span className="text-[var(--muted)]">…</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${PRIORITY_STYLE[report.priority]}`}
                      >
                        {PRIORITY_LABELS[report.priority]}
                      </span>
                      {report.duplicate ? (
                        <div className="mt-1 text-[11px] text-amber-300">
                          duplikátum
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {report.score}
                    </td>
                    <td className="px-3 py-2 text-xs">{report.lead.size} fő</td>
                    <td className="px-3 py-2 text-xs">
                      {report.lead.language}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {report.lead.email ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {report.lead.tags
                          .filter(
                            (tag) =>
                              !tag.startsWith("prioritas-") &&
                              !tag.startsWith("meret-"),
                          )
                          .slice(0, 4)
                          .map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
                            >
                              {tag}
                            </span>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Egy sorra kattintva látod a figyelmeztetéseket és a generált
            levelet.
          </p>
        </section>
      ) : null}
    </div>
  );
}
