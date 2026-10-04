"use client";

import { useMemo, useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import {
  buildExport,
  downloadText,
  type ExportFormat,
  type ExportScope,
} from "@/lib/export";
import type { ContactDoc } from "@/lib/types";
import { formatNumber } from "@/lib/format";

const FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  {
    value: "prompt",
    label: "AI prompt",
    hint: "Kész kutatási feladat + a lista — más AI-nak beilleszthető",
  },
  { value: "csv", label: "CSV", hint: "Excel / Google Sheets" },
  { value: "json", label: "JSON", hint: "Strukturált adat, gépi feldolgozásra" },
  { value: "markdown", label: "Markdown", hint: "Táblázat, dokumentumba illeszthető" },
];

export default function ExportBar({
  pageContacts,
  selectedIds,
  filteredTotal,
  fetchFiltered,
}: {
  pageContacts: ContactDoc[];
  selectedIds: Set<string>;
  /** Hány sor felel meg a szűrőnek (a lapozás nem korlátozza). */
  filteredTotal: number;
  /**
   * A teljes szűrt lista lekérése — csak akkor fut le, ha tényleg kell.
   * A lista lapozott, ezért a "Teljes szűrt lista" nincs a memóriában.
   */
  fetchFiltered: () => Promise<ContactDoc[]>;
}) {
  const [scope, setScope] = useState<ExportScope>("page");
  const [format, setFormat] = useState<ExportFormat>("prompt");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedContacts = useMemo(
    () => pageContacts.filter((contact) => selectedIds.has(contact._id)),
    [pageContacts, selectedIds],
  );

  const scopes: { value: ExportScope; label: string; count: number }[] = [
    { value: "page", label: "Ez az oldal", count: pageContacts.length },
    { value: "filtered", label: "Teljes szűrt lista", count: filteredTotal },
    { value: "selected", label: "Kijelöltek", count: selectedContacts.length },
  ];

  const active = scopes.find((item) => item.value === scope) ?? scopes[0];
  const disabled = active.count === 0 || busy;

  /** A kiválasztott hatókör sorai — a teljes listát csak itt töltjük le. */
  const resolve = async (): Promise<ContactDoc[]> => {
    if (scope === "page") return pageContacts;
    if (scope === "selected") return selectedContacts;
    setBusy(true);
    setStatus("Teljes lista letöltése…");
    try {
      return await fetchFiltered();
    } finally {
      setBusy(false);
    }
  };

  const flash = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(null), 2000);
  };

  const handleCopy = async () => {
    const contacts = await resolve();
    const { text } = buildExport(contacts, format);
    const ok = await copyToClipboard(text);
    flash(
      ok
        ? `${contacts.length} sor a vágólapon (${formatNumber(text.length)} karakter)`
        : "A másolás nem sikerült",
    );
  };

  const handleDownload = async () => {
    const contacts = await resolve();
    const { text, extension, mime } = buildExport(contacts, format);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(text, `melodia-${scope}-${stamp}.${extension}`, mime);
    flash(`${contacts.length} sor letöltve`);
  };

  return (
    <div className="flex flex-wrap items-end gap-2 px-1 py-2">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Mit exportál
        </span>
        <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
          {scopes.map((item) => (
            <button
              key={item.value}
              type="button"
              disabled={item.count === 0}
              onClick={() => setScope(item.value)}
              className={`h-9 px-3 text-sm transition disabled:opacity-30 ${
                scope === item.value
                  ? "bg-blue-600 text-white"
                  : "text-[var(--muted)] hover:text-foreground"
              }`}
            >
              {item.label}{" "}
              <span className="tabular-nums opacity-70">
                ({formatNumber(item.count)})
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Formátum
        </span>
        <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
          {FORMATS.map((item) => (
            <button
              key={item.value}
              type="button"
              title={item.hint}
              onClick={() => setFormat(item.value)}
              className={`h-9 px-3 text-sm transition ${
                format === item.value
                  ? "bg-blue-600 text-white"
                  : "text-[var(--muted)] hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handleCopy()}
        disabled={disabled}
        className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
      >
        Másolás vágólapra
      </button>
      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={disabled}
        className="h-9 rounded-lg border border-[var(--border)] px-4 text-sm transition hover:border-blue-500 disabled:opacity-40"
      >
        Letöltés fájlba
      </button>

      {status ? (
        <span className="text-xs text-emerald-400">{status}</span>
      ) : (
        <span className="text-xs text-[var(--muted)]">
          {FORMATS.find((item) => item.value === format)?.hint}
        </span>
      )}
    </div>
  );
}
