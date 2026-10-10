"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_TEMPLATES,
  PLACEHOLDERS,
  TEMPLATE_FIELDS,
  type TemplateField,
} from "@/lib/templates";

interface PreviewRow {
  id: string;
  company: string;
  language: string;
  value: string;
  missing: string[];
}

interface Result {
  applied: boolean;
  total: number;
  affected: number;
  skipped: number;
  tooLong: string[];
  rows: PreviewRow[];
}

/**
 * Tömeges szövegcsere: egy sablont írsz `{{cegnev}}` típusú helyettesítőkkel, és
 * minden kijelölt cégnél a saját adataival kerül be. Az alkalmazás előtt látod,
 * mi lesz az eredmény néhány konkrét cégnél.
 */
export default function BulkTemplate({
  ids,
  onClose,
  onApplied,
}: {
  ids: string[];
  onClose: () => void;
  onApplied: (message: string) => void;
}) {
  // A „Lead nyelve" nem szövegmező: ott sablon helyett nyelvet választasz.
  const [field, setField] = useState<TemplateField | "language">("emailBody");
  const [leadLanguage, setLeadLanguage] = useState<"hu" | "en">("hu");
  const languageMode = field === "language";
  // Mezőnként külön piszkozat: a tárgyhoz ne a hosszú levéltörzs maradjon bent.
  const [drafts, setDrafts] =
    useState<Record<string, string>>(DEFAULT_TEMPLATES);
  const template = drafts[field] ?? "";
  const setTemplate = (value: string) =>
    setDrafts((current) => ({ ...current, [field]: value }));
  const [language, setLanguage] = useState<"all" | "hu" | "en">("hu");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const line = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Helyettesítő beszúrása a kurzorhoz. */
  const insert = (key: string) => {
    const element = field === "emailSubject" ? line.current : area.current;
    const token = `{{${key}}}`;
    if (!element) {
      setTemplate(template + token);
      return;
    }
    const start = element.selectionStart ?? template.length;
    const end = element.selectionEnd ?? start;
    setTemplate(template.slice(0, start) + token + template.slice(end));
    setResult(null);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const run = async (mode: "preview" | "apply") => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/contacts/bulk-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          languageMode
            ? { ids, field, value: leadLanguage, mode }
            : { ids, field, template, language, mode },
        ),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hiba");
      setResult(data as Result);
      if (mode === "apply") {
        onApplied(
          `${data.affected} sor frissítve` +
            (data.skipped
              ? languageMode
                ? ` · ${data.skipped} sornak már ez volt a nyelve`
                : ` · ${data.skipped} kihagyva (más nyelv)`
              : ""),
        );
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fieldLabel =
    TEMPLATE_FIELDS.find((item) => item.key === field)?.label ?? field;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/60 p-4" onClick={onClose}>
      <div
        className="m-auto flex h-[92vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-3">
          <h2 className="text-sm font-semibold">
            {languageMode ? "Lead nyelve" : "Szöveg sablonból"} — {ids.length}{" "}
            kijelölt cég
          </h2>

          <select
            value={field}
            onChange={(event) => {
              setField(event.target.value as TemplateField | "language");
              setResult(null);
            }}
            className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm outline-none focus:border-blue-500"
          >
            {TEMPLATE_FIELDS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
            <option value="language">Lead nyelve</option>
          </select>

          {languageMode ? null : (
            <>
              <select
                value={language}
                onChange={(event) => {
                  setLanguage(event.target.value as "all" | "hu" | "en");
                  setResult(null);
                }}
                className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm outline-none focus:border-blue-500"
                title="Magyar szöveget ne írjunk angol nyelvű céghez."
              >
                <option value="hu">csak a magyar nyelvű sorokra</option>
                <option value="en">csak az angol nyelvű sorokra</option>
                <option value="all">mindegyikre</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  setDrafts((current) => ({
                    ...current,
                    [field]: DEFAULT_TEMPLATES[field] ?? "",
                  }));
                  setResult(null);
                }}
                className="h-9 rounded-lg border border-[var(--border)] px-3 text-xs transition hover:border-blue-500"
              >
                Alapszöveg visszatöltése
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            className="ml-auto h-8 rounded-lg border border-[var(--border)] px-3 text-xs text-[var(--muted)] hover:text-foreground"
          >
            Esc
          </button>
        </div>

        <div
          hidden={languageMode}
          className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] px-3 py-2 [&[hidden]]:hidden"
        >
          <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Helyettesítők
          </span>
          {PLACEHOLDERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => insert(item.key)}
              title={`${item.label} — pl. ${item.example}`}
              className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[11px] text-blue-300 transition hover:bg-blue-500/20"
            >
              {`{{${item.key}}}`}
            </button>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 lg:grid-cols-2">
          {languageMode ? (
            <div className="flex min-h-[300px] flex-col gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  Lead nyelve — mi legyen
                </span>
                <select
                  value={leadLanguage}
                  onChange={(event) => {
                    setLeadLanguage(event.target.value as "hu" | "en");
                    setResult(null);
                  }}
                  className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:border-blue-500"
                >
                  <option value="hu">magyar</option>
                  <option value="en">angol</option>
                </select>
              </label>
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                A kijelölt cégek nyelvét állítja át — a levél szövegéhez nem
                nyúl. A nyelv dönti el, melyik nyelvhez kötött csatolmány megy a
                levéllel (pl. az angol ajánlólevél csak angol nyelvű leadnek),
                milyen nyelvű a follow-up, és ebből jelöli a rendszer, ha a
                levél nyelve nem illik a cég országához. Akinek már ez a nyelve,
                az kimarad.
              </p>
            </div>
          ) : (
            <label className="flex min-h-[300px] flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                {fieldLabel} — sablon · {template.length} karakter
                {field === "connectionRequest" && template.length > 300 ? (
                  <span className="ml-1 text-amber-300">
                    (300 a LinkedIn korlátja)
                  </span>
                ) : null}
              </span>
              {field === "emailSubject" ? (
                // A tárgy egysoros — így egyértelmű, hogy nem levélszöveg kell ide.
                <input
                  ref={line}
                  value={template}
                  onChange={(event) => {
                    setTemplate(event.target.value);
                    setResult(null);
                  }}
                  spellCheck={false}
                  placeholder="Jelentkezés – full stack fejlesztő · {{cegnev}}"
                  className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:border-blue-500"
                />
              ) : (
                <textarea
                  ref={area}
                  value={template}
                  onChange={(event) => {
                    setTemplate(event.target.value);
                    setResult(null);
                  }}
                  spellCheck={false}
                  className="min-h-[300px] flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm leading-relaxed outline-none focus:border-blue-500"
                />
              )}
            </label>
          )}

          <div className="flex min-h-[300px] flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
              Előnézet {result ? `· ${result.affected} sorra vonatkozik` : ""}
            </span>
            <div className="flex-1 space-y-2 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
              {!result ? (
                <p className="text-[var(--muted)]">
                  {languageMode
                    ? "Nyomd meg az „Előnézet” gombot, és megmutatom, mely cégek nyelve változna."
                    : "Nyomd meg az „Előnézet” gombot, és megmutatom, hogyan néz ki a szöveg néhány konkrét cégnél."}
                </p>
              ) : result.rows.length === 0 ? (
                <p className="text-amber-300">
                  {languageMode
                    ? "Minden kijelölt cégnek már ez a nyelve — nincs mit átállítani."
                    : "Egy kijelölt sor sem felel meg a nyelvi szűrésnek."}
                </p>
              ) : languageMode ? (
                <>
                  {result.rows.map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-1 text-xs last:border-0"
                    >
                      <span className="min-w-0 break-all font-medium">
                        {row.company}
                      </span>
                      <span className="shrink-0 text-emerald-300">
                        {row.value}
                      </span>
                    </div>
                  ))}
                  {result.affected > result.rows.length ? (
                    <p className="text-xs text-[var(--muted)]">
                      …és még {result.affected - result.rows.length} cég.
                    </p>
                  ) : null}
                </>
              ) : (
                result.rows.map((row) => (
                  <div key={row.id} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium">{row.company}</span>
                      <span className="text-[var(--muted)]">
                        {row.language === "hu" ? "magyar" : "angol"}
                      </span>
                      {row.missing.length ? (
                        <span className="text-amber-300">
                          üres:{" "}
                          {row.missing.map((key) => `{{${key}}}`).join(", ")}
                        </span>
                      ) : null}
                    </div>
                    <pre className="whitespace-pre-wrap rounded-lg bg-[var(--surface-2)] p-2 text-[12px] leading-relaxed">
                      {row.value}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {error ? (
          <p className="px-3 pb-1 text-xs text-red-300">{error}</p>
        ) : null}
        {result?.tooLong.length ? (
          <p className="px-3 pb-1 text-xs text-amber-300">
            300 karakternél hosszabb lenne itt:{" "}
            {result.tooLong.slice(0, 5).join(", ")}
            {result.tooLong.length > 5
              ? ` (+${result.tooLong.length - 5})`
              : ""}{" "}
            — a LinkedIn levágja.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] p-3">
          <button
            type="button"
            disabled={busy || (!languageMode && !template.trim())}
            onClick={() => void run("preview")}
            className="h-9 rounded-lg border border-[var(--border)] px-4 text-sm transition hover:border-blue-500 disabled:opacity-40"
          >
            {busy ? "Dolgozom…" : "Előnézet"}
          </button>
          <button
            type="button"
            disabled={busy || !result || result.affected === 0}
            onClick={() => void run("apply")}
            className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
            title={!result ? "Előbb nézd meg az előnézetet." : undefined}
          >
            {languageMode ? "Mentés" : "Alkalmazom"}{" "}
            {result ? `(${result.affected} sor)` : ""}
          </button>
          {result?.applied ? (
            <span className="text-xs text-emerald-400">
              Mentve: {result.affected} sor
              {result.skipped
                ? languageMode
                  ? ` · ${result.skipped} sornak már ez volt a nyelve`
                  : ` · ${result.skipped} kihagyva`
                : ""}
            </span>
          ) : result ? (
            <span className="text-xs text-[var(--muted)]">
              {result.affected} sor érintett
              {result.skipped
                ? languageMode
                  ? ` · ${result.skipped} sornak már ez a nyelve`
                  : ` · ${result.skipped} kimarad (más nyelv)`
                : ""}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
