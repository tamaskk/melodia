"use client";

import { Fragment, useRef, useState } from "react";
import Link from "next/link";
import { copyToClipboard } from "@/lib/clipboard";
import { useFileDrop } from "@/lib/useFileDrop";
import { downloadText } from "@/lib/export";
import {
  KIND_LABELS,
  KINDS,
  parseImport,
  schemaPrompt,
  template,
} from "@/lib/importSchema";
import type { BatchMessage, ErrorMessage } from "@/lib/importStream.worker";
import type { ContactKind } from "@/lib/types";
import { formatNumber } from "@/lib/format";

interface Issue {
  index: number;
  company: string;
  field: string;
  message: string;
}

interface PreviewRow {
  key: string;
  company: string;
  person: string | null;
  email: string | null;
  country: string;
  size: string | null;
  kind: string;
  exists: boolean;
  /** Miért számít meglévőnek: azonos kulcs vagy azonos cégnév + ország. */
  matchedBy?: "kulcs" | "cegnev" | "domain" | null;
  /** Kimarad az írásból, mert meglévő cég és védett módban vagyunk. */
  skipped?: boolean;
  /** Más név, de ugyanaz a domain, mint egy meglévő cégnek — ehhez kell döntés. */
  domainMatch?: {
    originalKey: string;
    company: string;
    decision: DomainDecision;
  } | null;
}

type DomainDecision = "merge" | "new" | "skip";

interface ImportResult {
  applied: boolean;
  errors: Issue[];
  warnings: Issue[];
  preview: PreviewRow[];
  newCount: number;
  updateCount: number;
  skippedCount?: number;
  skipExisting?: boolean;
  /** Darabolt módban: ennyi sort dolgoztunk fel (az előnézet csak egy része). */
  processed?: number;
}

/** Ekkora JSON-fájl felett nem töltjük be a szövegmezőbe, hanem darabolva olvassuk. */
const BIG_FILE_BYTES = 5 * 1024 * 1024;
/** Ennyi objektum megy egy kérésben az /api/import-ra. */
const BATCH_SIZE = 10;
/** Darabolt módban legfeljebb ennyi sort és üzenetet tartunk meg a felületen. */
const PREVIEW_CAP = 300;
const ISSUE_CAP = 500;
/** Hálózati hibánál ennyiszer próbáljuk újra ugyanazt a darabot. */
const RETRIES = 3;

/**
 * Végigolvassa a fájlt Workerben, darabonként. Az `onBatch` végéig nem kér
 * újabb darabot, így a memória a darab méretével arányos.
 */
async function streamFile(
  file: File,
  onBatch: (batch: BatchMessage) => Promise<boolean | void>,
) {
  const worker = new Worker(
    new URL("../lib/importStream.worker.ts", import.meta.url),
  );
  const next = () =>
    new Promise<BatchMessage>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<BatchMessage | ErrorMessage>) =>
        event.data.type === "batch"
          ? resolve(event.data)
          : reject(new Error(event.data.message));
      worker.onerror = (event) => reject(new Error(event.message));
      worker.postMessage({ type: "next" });
    });
  try {
    worker.postMessage({ type: "open", file, batchSize: BATCH_SIZE });
    for (;;) {
      const batch = await next();
      if (batch.rows.length && (await onBatch(batch)) === false) return;
      if (batch.done) return;
    }
  } finally {
    worker.terminate();
  }
}

const withOffset = (issues: Issue[], offset: number) =>
  issues.map((issue) => ({ ...issue, index: issue.index + offset }));

const KIND_HINT: Record<ContactKind, string> = {
  agency: "Cégnév + levél. Személy nem kell.",
  recruiter:
    "Személy kötelező. LinkedIn üzenet és kapcsolatkérés is megadható.",
  "company-leader": "Személy + cég. Külön LinkedIn üzenet és kapcsolatkérés.",
  "it-company": "Terméket fejlesztő IT cég. Kötelező a létszám-sáv (size).",
};

export default function ImportPanel() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [schemaKind, setSchemaKind] = useState<ContactKind>("agency");
  // "" = maradjon a sorokban lévő / kikövetkeztetett típus.
  const [forceKind, setForceKind] = useState<ContactKind | "">("");
  // Alapból védett: a meglévő cégeket nem írjuk felül. A CSV-ből generált
  // listákban nincs e-mail, azoknak sosem szabad felülírniuk a kikutatott adatot.
  const [skipExisting, setSkipExisting] = useState(true);
  // Domain-egyezésnél soronkénti döntés: összevonás / új iroda / kihagyás.
  const [domainDecisions, setDomainDecisions] = useState<
    Record<string, DomainDecision>
  >({});
  // Nagy fájl: nem kerül a szövegmezőbe, darabolva olvassuk.
  const [bigFile, setBigFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<{
    phase: "check" | "apply";
    rows: number;
    bytes: number;
  } | null>(null);
  const cancelled = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const flash = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(null), 2500);
  };

  const showResult = (data: ImportResult) => {
    setResult(data);
    // Jump to the report so a failed import is never silent.
    setTimeout(
      () =>
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      50,
    );
  };

  /** Helyi ellenőrzés hálózat nélkül: a sémát a böngésző is le tudja futtatni. */
  const checkBig = async (file: File): Promise<ImportResult> => {
    const errors: Issue[] = [];
    const warnings: Issue[] = [];
    let processed = 0;
    await streamFile(file, async (batch) => {
      if (cancelled.current) return false;
      const parsed = parseImport(batch.rows, {
        forceKind: forceKind || undefined,
      });
      if (errors.length < ISSUE_CAP)
        errors.push(...withOffset(parsed.errors, batch.offset));
      if (warnings.length < ISSUE_CAP)
        warnings.push(...withOffset(parsed.warnings, batch.offset));
      processed += batch.rows.length;
      setProgress({ phase: "check", rows: processed, bytes: batch.bytesRead });
    });
    return {
      applied: false,
      errors: errors.slice(0, ISSUE_CAP),
      warnings: warnings.slice(0, ISSUE_CAP),
      preview: [],
      newCount: 0,
      updateCount: 0,
      processed,
    };
  };

  /** Egy darab beküldése; hálózati hibánál néhányszor újrapróbálja. */
  const postBatch = async (rows: unknown[]) => {
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            json: rows,
            mode: "apply",
            kind: forceKind || undefined,
            skipExisting,
            domainDecisions,
          }),
        });
        const data = (await response.json()) as ImportResult & {
          error?: string;
        };
        if (data.error) throw new Error(data.error);
        return data;
      } catch (error) {
        if (attempt >= RETRIES) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  };

  const sendBig = async (file: File, mode: "preview" | "apply") => {
    setBusy(true);
    cancelled.current = false;
    try {
      const checked = await checkBig(file);
      if (cancelled.current) {
        flash("Megszakítva — nem írtam semmit az adatbázisba.");
        return;
      }
      if (mode === "preview" || checked.errors.length) {
        showResult(checked);
        flash(
          checked.errors.length
            ? `Nem importáltam: ${checked.errors.length} hiba. A részletek alább.`
            : `Rendben: ${formatNumber(checked.processed ?? 0)} sor. Nyomd meg az Importálást.`,
        );
        return;
      }

      const total: ImportResult = {
        applied: true,
        errors: [],
        warnings: [],
        preview: [],
        newCount: 0,
        updateCount: 0,
        skippedCount: 0,
        skipExisting,
        processed: 0,
      };
      let stoppedAt: number | null = null;
      try {
        await streamFile(file, async (batch) => {
          if (cancelled.current) {
            stoppedAt = batch.offset;
            return false;
          }
          const data = await postBatch(batch.rows).catch((error: Error) => {
            stoppedAt = batch.offset;
            throw error;
          });
          total.newCount += data.newCount;
          total.updateCount += data.updateCount;
          total.skippedCount =
            (total.skippedCount ?? 0) + (data.skippedCount ?? 0);
          total.processed = (total.processed ?? 0) + batch.rows.length;
          if (total.errors.length < ISSUE_CAP)
            total.errors.push(...withOffset(data.errors, batch.offset));
          // A darabonkénti „N cég már szerepel" összesítő helyett a számlálók beszélnek.
          if (total.warnings.length < ISSUE_CAP)
            total.warnings.push(
              ...withOffset(
                data.warnings.filter((issue) => issue.field !== "duplikáció"),
                batch.offset,
              ),
            );
          // Az előnézetbe az újak és a domain-egyezések kerülnek, korláttal.
          for (const row of data.preview) {
            if (total.preview.length >= PREVIEW_CAP) break;
            if (!row.exists || row.domainMatch) total.preview.push(row);
          }
          setProgress({
            phase: "apply",
            rows: total.processed,
            bytes: batch.bytesRead,
          });
        });
      } catch (error) {
        flash(
          `Megállt a(z) ${formatNumber((stoppedAt ?? 0) + 1)}. sornál: ${(error as Error).message}. Az addigi sorok bekerültek.`,
        );
      }
      total.preview.sort((a, b) => Number(a.exists) - Number(b.exists));
      showResult(total);
      if (stoppedAt === null) {
        flash(
          `Kész: ${formatNumber(total.newCount)} új` +
            (total.skippedCount
              ? `, ${formatNumber(total.skippedCount)} meglévő érintetlen`
              : `, ${formatNumber(total.updateCount)} frissítve`) +
            " az adatbázisban.",
        );
      } else if (cancelled.current) {
        flash(
          `Megszakítva a(z) ${formatNumber(stoppedAt + 1)}. sornál — az addigi sorok bekerültek.`,
        );
      }
    } catch (error) {
      flash((error as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const send = async (
    mode: "preview" | "apply",
    decisions: Record<string, DomainDecision> = domainDecisions,
  ) => {
    if (bigFile) return sendBig(bigFile, mode);
    setBusy(true);
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          json: text,
          mode,
          kind: forceKind || undefined,
          skipExisting,
          domainDecisions: decisions,
        }),
      });
      const data = (await response.json()) as ImportResult & { error?: string };
      if (data.error) throw new Error(data.error);
      showResult(data);

      if (data.applied) {
        flash(
          `Kész: ${data.newCount} új` +
            (data.skippedCount
              ? `, ${data.skippedCount} meglévő érintetlen`
              : `, ${data.updateCount} frissítve`) +
            " az adatbázisban.",
        );
      } else if (data.errors.length) {
        // Clicking "import" with invalid data must say why, not just do nothing.
        flash(
          `Nem importáltam: ${data.errors.length} hiba ${
            new Set(data.errors.map((issue) => issue.index)).size
          } sorban. A részletek alább.`,
        );
      } else if (mode === "preview") {
        flash(
          `Rendben: ${data.newCount} új, ${data.updateCount} frissülne. Nyomd meg az Importálást.`,
        );
      }
    } catch (error) {
      flash((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const loadFile = async (file: File) => {
    if (!/\.(json|csv|txt)$/i.test(file.name)) {
      flash(`Ezt nem tudom beolvasni: ${file.name} — .json vagy .csv kell.`);
      return;
    }
    setResult(null);
    if (/\.json$/i.test(file.name) && file.size > BIG_FILE_BYTES) {
      setText("");
      setBigFile(file);
      flash(
        `${file.name} (${formatNumber(Math.round(file.size / 1024 / 1024))} MB) — darabolva olvasom, ${BATCH_SIZE} soronként küldöm.`,
      );
      return;
    }
    setBigFile(null);
    const content = await file.text();
    setText(content);
    flash(`${file.name} beolvasva (${formatNumber(content.length)} karakter).`);
  };

  const drop = useFileDrop(loadFile);

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Import</h1>
          <p className="text-sm text-[var(--muted)]">
            Illessz be JSON-t vagy CSV-t (cégexport is jó), vagy tölts fel
            fájlt. Az ellenőrzés után látod, mi lesz új és mi frissül — csak
            utána ír az adatbázisba.
          </p>
        </div>
        <Link
          href="/convert"
          className="h-9 rounded-lg border border-[var(--border)] px-3 text-sm leading-9 transition hover:border-blue-500"
        >
          Hunter CSV →
        </Link>
      </header>

      {/* --- templates ------------------------------------------------ */}
      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
          Sablonok típusonként
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {KINDS.map((kind) => (
            <div
              key={kind}
              className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
            >
              <div>
                <div className="font-medium">{KIND_LABELS[kind]}</div>
                <div className="mt-0.5 text-xs text-[var(--muted)]">
                  {KIND_HINT[kind]}
                </div>
                <code className="mt-1 block text-[11px] text-blue-300">
                  kind: &quot;{kind}&quot;
                </code>
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadText(
                      JSON.stringify(template(kind), null, 2),
                      `melodia-sablon-${kind}.json`,
                      "application/json",
                    )
                  }
                  className="h-8 rounded-lg border border-[var(--border)] px-2.5 text-xs transition hover:border-blue-500"
                >
                  Sablon letöltése
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setText(JSON.stringify(template(kind), null, 2));
                    setResult(null);
                  }}
                  className="h-8 rounded-lg border border-[var(--border)] px-2.5 text-xs transition hover:border-blue-500"
                >
                  Beillesztés alulra
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* --- AI brief -------------------------------------------------- */}
      <section className="space-y-3 rounded-xl border border-violet-500/40 bg-violet-500/5 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-200">
          Séma egy másik AI-nak
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Másold be egy AI-chatbe a listáddal együtt — a válasza közvetlenül
          beilleszthető lesz ide.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
            {KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setSchemaKind(kind)}
                className={`h-9 px-3 text-sm transition ${
                  schemaKind === kind
                    ? "bg-violet-600 text-white"
                    : "text-[var(--muted)] hover:text-foreground"
                }`}
              >
                {KIND_LABELS[kind]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={async () => {
              const ok = await copyToClipboard(schemaPrompt(schemaKind));
              flash(ok ? "Séma a vágólapon" : "A másolás nem sikerült");
            }}
            className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white transition hover:bg-violet-500"
          >
            Séma másolása
          </button>
          <button
            type="button"
            onClick={() =>
              downloadText(
                schemaPrompt(schemaKind),
                `melodia-sema-${schemaKind}.txt`,
                "text/plain",
              )
            }
            className="h-9 rounded-lg border border-[var(--border)] px-4 text-sm transition hover:border-violet-500"
          >
            Séma letöltése
          </button>
        </div>
        <details className="text-xs text-[var(--muted)]">
          <summary className="cursor-pointer">Séma megtekintése</summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            {schemaPrompt(schemaKind)}
          </pre>
        </details>
      </section>

      {/* --- input ----------------------------------------------------- */}
      <section
        {...drop.dropProps}
        className={`relative space-y-2 rounded-xl border bg-[var(--surface)] p-4 transition ${
          drop.dragging
            ? "border-blue-500 bg-blue-500/5 ring-2 ring-blue-500/40"
            : "border-[var(--border)]"
        }`}
      >
        {drop.dragging ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[var(--background)]/80 text-sm font-medium text-blue-300">
            Engedd el — beolvasom a fájlt
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
            JSON vagy CSV
          </h2>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json,text/csv,.csv,.txt"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
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
              setText("");
              setBigFile(null);
              setResult(null);
            }}
            className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs text-[var(--muted)] transition hover:text-foreground"
          >
            Ürítés
          </button>
          <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            Típus:
            <select
              value={forceKind}
              onChange={(event) => {
                setForceKind(event.target.value as ContactKind | "");
                setResult(null);
              }}
              className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-xs text-foreground outline-none focus:border-blue-500"
            >
              <option value="">Ami a fájlban van (automatikus)</option>
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  Mind: {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <label
            className="flex items-center gap-1.5 text-xs text-[var(--muted)]"
            title="A CSV-ből generált listákban nincs e-mail cím — ezek soha ne írják felül a meglévő sorokat."
          >
            <input
              type="checkbox"
              checked={skipExisting}
              onChange={(event) => {
                setSkipExisting(event.target.checked);
                setResult(null);
              }}
              className="size-4 accent-emerald-500"
            />
            csak új cégek (meglévőket nem írom felül)
          </label>
          <span className="ml-auto text-xs text-[var(--muted)]">
            {bigFile
              ? `${formatNumber(Math.round(bigFile.size / 1024 / 1024))} MB`
              : `${formatNumber(text.length)} karakter`}
          </span>
        </div>

        {bigFile ? (
          <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
            <div>
              <strong>{bigFile.name}</strong> — túl nagy a szövegmezőhöz, ezért
              darabolva olvasom: az ellenőrzés itt, a böngészőben fut, az
              importálás {BATCH_SIZE} soronként megy az adatbázisba.
            </div>
            {progress ? (
              <div className="space-y-1">
                <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
                  <div
                    className="h-full bg-blue-500 transition-[width]"
                    style={{
                      width: `${Math.min(100, (progress.bytes / bigFile.size) * 100).toFixed(1)}%`,
                    }}
                  />
                </div>
                <div className="text-xs text-[var(--muted)] tabular-nums">
                  {progress.phase === "check" ? "Ellenőrzés" : "Importálás"}:{" "}
                  {formatNumber(progress.rows)} sor ·{" "}
                  {Math.round((progress.bytes / bigFile.size) * 100)}%
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setResult(null);
            }}
            spellCheck={false}
            placeholder={
              "Húzd ide a fájlt, vagy illeszd be:\n\n" +
              '[ { "kind": "agency", "company": "…", "country": "HU", "emailSubject": "…", "emailBody": "…" } ]\n\n' +
              "vagy CSV fejléccel:\nCompany Name,Domain,City,Country,Industry,Headcount,Linkedin,Description"
            }
            className="min-h-[260px] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 font-mono text-xs leading-relaxed outline-none focus:border-blue-500"
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || (!bigFile && text.trim().length === 0)}
            onClick={() => void send("preview")}
            className="h-9 rounded-lg border border-[var(--border)] px-4 text-sm transition hover:border-blue-500 disabled:opacity-40"
          >
            {busy ? "Ellenőrzés…" : "Ellenőrzés"}
          </button>
          <button
            type="button"
            disabled={busy || (!bigFile && text.trim().length === 0)}
            onClick={() => void send("apply")}
            className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
          >
            Importálás az adatbázisba
          </button>
          {busy && bigFile ? (
            <button
              type="button"
              onClick={() => {
                cancelled.current = true;
              }}
              className="h-9 rounded-lg border border-red-500/50 px-4 text-sm text-red-300 transition hover:border-red-400"
            >
              Megszakítás
            </button>
          ) : null}
          {status ? (
            <span
              className={`text-sm ${
                status.startsWith("Nem importáltam") ||
                status.startsWith("Hibás") ||
                status.startsWith("Megállt") ||
                status.startsWith("Megszakítva")
                  ? "text-red-400"
                  : "text-emerald-400"
              }`}
            >
              {status}
            </span>
          ) : (
            <span className="text-xs text-[var(--muted)]">
              Az Importálás előbb ellenőriz; hiba esetén nem ír semmit az
              adatbázisba, hanem kiírja, mi a gond.
            </span>
          )}
        </div>
      </section>

      {/* --- result ---------------------------------------------------- */}
      {result ? (
        <section
          ref={resultRef}
          className={`space-y-3 rounded-xl border bg-[var(--surface)] p-4 ${
            result.errors.length
              ? "border-red-500/50"
              : result.applied
                ? "border-emerald-500/50"
                : "border-[var(--border)]"
          }`}
        >
          <div
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              result.errors.length
                ? "bg-red-500/15 text-red-300"
                : result.applied
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-blue-500/15 text-blue-300"
            }`}
          >
            {result.errors.length
              ? result.applied
                ? `Részleges import: ${formatNumber(result.newCount)} új, ${formatNumber(result.updateCount)} frissítve — ${result.errors.length} hibás sor kimaradt (lásd alább).`
                : `Az import nem futott le: ${result.errors.length} hiba ${
                    new Set(result.errors.map((issue) => issue.index)).size
                  } sorban. Semmi nem került az adatbázisba — javítsd az alábbiakat, és nyomd meg újra.`
              : result.applied
                ? `Sikeres import: ${result.newCount} új sor, ${result.updateCount} frissítve.`
                : `Az adatok rendben (${formatNumber(result.processed ?? result.preview.length)} sor). Nyomd meg az „Importálás az adatbázisba" gombot.`}
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-lg bg-[var(--surface-2)] px-3 py-1.5">
              Feldolgozott sor:{" "}
              <strong className="tabular-nums">
                {formatNumber(result.processed ?? result.preview.length)}
              </strong>
            </span>
            <span className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-emerald-300">
              Új: <strong className="tabular-nums">{result.newCount}</strong>
            </span>
            {result.skippedCount ? (
              <span className="rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-[var(--muted)]">
                Kihagyva (meglévő):{" "}
                <strong className="tabular-nums">{result.skippedCount}</strong>
              </span>
            ) : (
              <span className="rounded-lg bg-blue-500/15 px-3 py-1.5 text-blue-300">
                Frissül:{" "}
                <strong className="tabular-nums">{result.updateCount}</strong>
              </span>
            )}
            {result.errors.length ? (
              <span className="rounded-lg bg-red-500/15 px-3 py-1.5 text-red-300">
                Hiba:{" "}
                <strong className="tabular-nums">{result.errors.length}</strong>
              </span>
            ) : null}
            {result.warnings.length ? (
              <span className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-amber-300">
                Figyelmeztetés:{" "}
                <strong className="tabular-nums">
                  {result.warnings.length}
                </strong>
              </span>
            ) : null}
          </div>

          {result.errors.length ? (
            <div className="space-y-1 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
              <div className="font-medium text-red-300">
                Ezeket javítsd, addig nem lehet importálni:
              </div>

              {/* Same mistake usually repeats in every row — summarise first. */}
              <div className="mb-2 space-y-0.5">
                {Object.entries(
                  result.errors.reduce<Record<string, number>>((acc, issue) => {
                    const label = `${issue.field} — ${issue.message}`;
                    acc[label] = (acc[label] ?? 0) + 1;
                    return acc;
                  }, {}),
                )
                  .sort((a, b) => b[1] - a[1])
                  .map(([label, count]) => (
                    <div key={label} className="text-red-100">
                      <strong className="tabular-nums">{count} sorban:</strong>{" "}
                      {label}
                    </div>
                  ))}
              </div>

              <div className="text-xs uppercase tracking-wider text-red-300/70">
                Soronként
              </div>
              {result.errors.slice(0, 40).map((issue, index) => (
                <div key={index} className="text-red-200">
                  <span className="tabular-nums opacity-70">
                    #{issue.index + 1}
                  </span>{" "}
                  {issue.company} · <code>{issue.field}</code> — {issue.message}
                </div>
              ))}
              {result.errors.length > 40 ? (
                <div className="text-red-300/70">
                  …és még {result.errors.length - 40} hiba.
                </div>
              ) : null}
            </div>
          ) : null}

          {result.warnings.length ? (
            <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              {result.warnings.slice(0, 20).map((issue, index) => (
                <div key={index}>
                  <span className="tabular-nums opacity-70">
                    #{issue.index + 1}
                  </span>{" "}
                  {issue.company} · <code>{issue.field}</code> — {issue.message}
                </div>
              ))}
              {result.warnings.length > 20 ? (
                <div className="opacity-70">
                  …és még {result.warnings.length - 20} figyelmeztetés.
                </div>
              ) : null}
            </div>
          ) : null}

          {result.preview.length ? (
            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-[var(--surface-2)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2">Állapot</th>
                    <th className="px-3 py-2">Cég</th>
                    <th className="px-3 py-2">Személy</th>
                    <th className="px-3 py-2">E-mail</th>
                    <th className="px-3 py-2">Ország</th>
                    <th className="px-3 py-2">Létszám</th>
                    <th className="px-3 py-2">Típus</th>
                  </tr>
                </thead>
                <tbody>
                  {result.preview.map((row, index) => {
                    // A szerver az újakat előre rendezte — itt csak elválasztjuk
                    // a két csoportot, hogy egy pillantással látszódjon a határ.
                    const previous = result.preview[index - 1];
                    const startsExisting = row.exists && !previous?.exists;
                    const startsNew = !row.exists && index === 0;

                    return (
                      <Fragment key={row.key}>
                        {startsNew ? (
                          <tr className="border-t border-[var(--border)] bg-emerald-500/10">
                            <td
                              colSpan={7}
                              className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-emerald-300"
                            >
                              Még nincs az adatbázisban — {result.newCount} új
                              cég
                            </td>
                          </tr>
                        ) : null}
                        {startsExisting ? (
                          <tr className="border-t border-[var(--border)] bg-blue-500/10">
                            <td
                              colSpan={7}
                              className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-blue-300"
                            >
                              {result.skipExisting
                                ? `Már szerepel — ${result.skippedCount ?? 0} cég érintetlen marad, nem írom felül`
                                : `Már szerepel — ${result.updateCount} cég frissül, nem keletkezik duplikátum`}
                            </td>
                          </tr>
                        ) : null}
                        <tr
                          className={`border-t border-[var(--border)] ${
                            row.exists ? "opacity-70" : ""
                          }`}
                        >
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] ${
                                !row.exists
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : row.skipped
                                    ? "bg-[var(--surface-2)] text-[var(--muted)]"
                                    : "bg-blue-500/20 text-blue-300"
                              }`}
                            >
                              {row.skipped
                                ? "kihagyom"
                                : row.exists
                                  ? "frissül"
                                  : "új"}
                            </span>
                            {row.domainMatch ? (
                              <label className="mt-1 block text-[11px] text-amber-300">
                                ugyanaz a domain, mint:{" "}
                                {row.domainMatch.company}
                                <select
                                  value={row.domainMatch.decision}
                                  onChange={(event) => {
                                    const next = {
                                      ...domainDecisions,
                                      [row.domainMatch!.originalKey]: event
                                        .target.value as DomainDecision,
                                    };
                                    setDomainDecisions(next);
                                    // Darabolt módban ez a sor már beírt —
                                    // nem olvassuk újra az egész fájlt miatta.
                                    if (!bigFile) void send("preview", next);
                                  }}
                                  className="mt-0.5 block h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-xs text-foreground"
                                >
                                  <option value="merge">
                                    Összevonás a meglévővel
                                  </option>
                                  <option value="new">
                                    Új iroda (külön sor)
                                  </option>
                                  <option value="skip">Kihagyás</option>
                                </select>
                              </label>
                            ) : null}
                            {row.exists ? (
                              <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                                {row.matchedBy === "cegnev"
                                  ? "cégnév + ország egyezik"
                                  : row.matchedBy === "domain"
                                    ? "azonos domain"
                                    : "azonos kulcs"}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">{row.company}</td>
                          <td className="px-3 py-2">{row.person ?? "—"}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {row.email ?? "—"}
                          </td>
                          <td className="px-3 py-2">{row.country}</td>
                          <td className="px-3 py-2">{row.size ?? "—"}</td>
                          <td className="px-3 py-2">
                            {KIND_LABELS[row.kind as ContactKind] ?? row.kind}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
