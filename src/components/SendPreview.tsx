"use client";

import { useCallback, useEffect, useState } from "react";
import { formatNumber } from "@/lib/format";

export interface PreviewItem {
  id: string;
  company: string;
  email: string;
  language: string;
  subject: string;
  body: string;
  attachments: string[];
  /** A küldés előtti ellenőrzés figyelmeztetései erre a címzettre. */
  warnings?: string[];
}

/** A küldés előtti ellenőrzés egy tétele (a szerver számolja a teljes sorra). */
export interface PreflightCheck {
  key: string;
  level: "error" | "warn";
  label: string;
  hint: string;
  count: number;
  examples: { company: string; email: string }[];
}

/** A sorból kihagyott címzettek: az a cím vagy cég már kapott levelet. */
export interface PreviewSkipped {
  sameEmail: number;
  sameDomain: number;
  inQueue: number;
  examples: { company: string; email: string; reason: string }[];
}

/**
 * Küldés előtti ellenőrzés: végigkattinthatod, kinek pontosan milyen levél megy
 * ki, javíthatsz rajta kézzel, vagy átírathatod AI-jal egy instrukció alapján.
 * Amíg innen nem indítod el, egyetlen levél sem megy sehova.
 */
export default function SendPreview({
  items,
  total,
  skipped,
  checks,
  aiEnabled,
  busy,
  onClose,
  onStart,
}: {
  items: PreviewItem[];
  /** Hány címzett van összesen a sorban (az előnézet ennek az eleje). */
  total: number;
  skipped?: PreviewSkipped | null;
  checks?: PreflightCheck[];
  aiEnabled: boolean;
  busy: boolean;
  onClose: () => void;
  onStart: () => void;
}) {
  // A komponens minden előnézet-nyitáskor újra létrejön (a szülő `key`-t ad),
  // ezért a kezdőérték elég — nincs szükség szinkronizáló effektre.
  const [rows, setRows] = useState<PreviewItem[]>(items);
  const [index, setIndex] = useState(0);
  const [instruction, setInstruction] = useState("");
  const [applyToAll, setApplyToAll] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  const current = rows[index];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch = useCallback((id: string, changes: Partial<PreviewItem>) => {
    setRows((all) =>
      all.map((row) => (row.id === id ? { ...row, ...changes } : row)),
    );
    setDirty((all) => ({ ...all, [id]: true }));
  }, []);

  /** Kézi módosítás mentése az adatbázisba. */
  const save = async (row: PreviewItem) => {
    const response = await fetch(`/api/contacts/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailSubject: row.subject, emailBody: row.body }),
    });
    if (!response.ok) throw new Error("Nem sikerült menteni a módosítást.");
    setDirty((all) => ({ ...all, [row.id]: false }));
  };

  /** Egy levél átíratása AI-jal; az eredményt rögtön el is mentjük. */
  const rewriteOne = async (row: PreviewItem, prompt: string) => {
    const response = await fetch(`/api/contacts/${row.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: prompt }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "AI hiba");

    await fetch(`/api/contacts/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emailSubject: data.subject,
        emailBody: data.body,
      }),
    });
    setRows((all) =>
      all.map((item) =>
        item.id === row.id
          ? { ...item, subject: data.subject, body: data.body }
          : item,
      ),
    );
    setDirty((all) => ({ ...all, [row.id]: false }));
  };

  const rewrite = async () => {
    if (!instruction.trim() || !current) return;
    setError(null);
    setStatus(null);
    try {
      if (applyToAll) {
        // Sorban megyünk végig, hogy lássuk, hol tart, és hiba se vesszen el.
        for (const [position, row] of rows.entries()) {
          setWorking(`${position + 1}/${rows.length} · ${row.company}`);
          await rewriteOne(row, instruction);
        }
        setStatus(`${rows.length} levél átírva és elmentve.`);
      } else {
        setWorking(current.company);
        await rewriteOne(current, instruction);
        setStatus(`„${current.company}" levele átírva és elmentve.`);
      }
      setInstruction("");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const saveCurrent = async () => {
    if (!current) return;
    setError(null);
    try {
      await save(current);
      setStatus("Mentve.");
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const unsaved = Object.values(dirty).some(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex bg-black/60 p-4" onClick={onClose}>
      <div
        className="m-auto flex h-[92vh] w-full max-w-[1200px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* címzettek */}
        <div className="flex w-72 shrink-0 flex-col border-r border-[var(--border)]">
          <div className="border-b border-[var(--border)] p-3">
            <h2 className="text-sm font-semibold">Kiküldés előnézete</h2>
            <p className="text-xs text-[var(--muted)]">
              {rows.length} levél
              {total > rows.length
                ? ` (a sorban ${formatNumber(total)} vár)`
                : ""}{" "}
              · innen még semmi nem ment ki
            </p>
            {/* Küldés előtti ellenőrzés: a teljes sorra, nem csak az előnézetre. */}
            <div className="mt-2 space-y-1 text-[11px]">
              {checks && checks.length ? (
                checks.map((check) => (
                  <details key={check.key}>
                    <summary
                      className={`cursor-pointer ${
                        check.level === "error"
                          ? "text-red-300"
                          : "text-amber-300"
                      }`}
                      title={check.hint}
                    >
                      {check.level === "error" ? "✕" : "⚠"} {check.count} —{" "}
                      {check.label}
                      {check.level === "error" ? " (kimarad)" : ""}
                    </summary>
                    <p className="mt-0.5 text-[var(--muted)]">{check.hint}</p>
                    <ul className="text-[var(--muted)]">
                      {check.examples.map((example) => (
                        <li
                          key={`${check.key}-${example.email}`}
                          className="truncate"
                        >
                          {example.company} —{" "}
                          <span className="font-mono">{example.email}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))
              ) : (
                <p className="text-emerald-300">
                  ✓ Küldés előtti ellenőrzés: minden rendben
                </p>
              )}
            </div>
            {skipped &&
            skipped.sameEmail + skipped.sameDomain + skipped.inQueue > 0 ? (
              <details className="mt-1.5 text-[11px] text-amber-300">
                <summary className="cursor-pointer">
                  Kihagyva{" "}
                  {skipped.sameEmail + skipped.sameDomain + skipped.inQueue}
                  {skipped.sameEmail
                    ? ` · ${skipped.sameEmail} címre már ment`
                    : ""}
                  {skipped.sameDomain
                    ? ` · ${skipped.sameDomain} cégre már ment`
                    : ""}
                  {skipped.inQueue
                    ? ` · ${skipped.inQueue} ismétlődés a sorban`
                    : ""}
                </summary>
                <ul className="mt-1 space-y-0.5 text-[var(--muted)]">
                  {skipped.examples.map((example) => (
                    <li key={`${example.company}-${example.email}`}>
                      {example.company} —{" "}
                      <span className="font-mono">{example.email}</span>
                      <span className="block text-[11px]">
                        {example.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
          <div className="flex-1 overflow-auto">
            {rows.map((row, position) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setIndex(position)}
                className={`flex w-full flex-col gap-0.5 border-b border-[var(--border)]/50 px-3 py-2 text-left transition ${
                  position === index
                    ? "bg-[var(--surface-2)]"
                    : "hover:bg-[var(--surface)]"
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm">
                  <span className="text-[var(--muted)]">{position + 1}.</span>
                  <span className="truncate">{row.company}</span>
                  {row.warnings?.length ? (
                    <span
                      className="text-[11px] text-amber-300"
                      title={row.warnings.join(" · ")}
                    >
                      ⚠
                    </span>
                  ) : null}
                  {dirty[row.id] ? (
                    <span className="ml-auto text-[11px] text-amber-300">
                      •
                    </span>
                  ) : null}
                </span>
                <span className="truncate font-mono text-[11px] text-[var(--muted)]">
                  {row.email}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* levél */}
        <div className="flex min-w-0 flex-1 flex-col">
          {current ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-3">
                <span className="font-medium">{current.company}</span>
                <span className="font-mono text-xs text-[var(--muted)]">
                  {current.email}
                </span>
                <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                  {current.language === "hu" ? "magyar" : "angol"}
                </span>
                {current.attachments.map((name) => (
                  <span
                    key={name}
                    className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
                  >
                    📎 {name}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={onClose}
                  className="ml-auto h-8 rounded-lg border border-[var(--border)] px-3 text-xs text-[var(--muted)] hover:text-foreground"
                >
                  Esc
                </button>
              </div>

              {aiEnabled ? (
                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-violet-500/5 p-3">
                  <input
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !working) void rewrite();
                    }}
                    placeholder="Instrukció az AI-nak: pl. „legyen rövidebb és konkrétabb”"
                    className="h-9 min-w-[240px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm outline-none focus:border-violet-500"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                    <input
                      type="checkbox"
                      checked={applyToAll}
                      onChange={(event) => setApplyToAll(event.target.checked)}
                      className="size-4 accent-violet-500"
                    />
                    mind a {rows.length} levélre
                  </label>
                  <button
                    type="button"
                    disabled={Boolean(working) || !instruction.trim()}
                    onClick={() => void rewrite()}
                    className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
                  >
                    {working ? `Átírás… ${working}` : "✨ Átírás AI-val"}
                  </button>
                </div>
              ) : null}

              {status ? (
                <p className="px-3 pt-2 text-xs text-emerald-400">{status}</p>
              ) : null}
              {error ? (
                <p className="px-3 pt-2 text-xs text-red-300">{error}</p>
              ) : null}

              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                    Tárgy
                  </span>
                  <input
                    value={current.subject}
                    onChange={(event) =>
                      patch(current.id, { subject: event.target.value })
                    }
                    className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:border-blue-500"
                  />
                </label>
                <label className="flex min-h-0 flex-1 flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                    Levél szövege — {current.body.length} karakter
                  </span>
                  <textarea
                    value={current.body}
                    onChange={(event) =>
                      patch(current.id, { body: event.target.value })
                    }
                    className="min-h-[320px] flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-relaxed outline-none focus:border-blue-500"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] p-3">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => setIndex((value) => Math.max(0, value - 1))}
                  className="h-9 rounded-lg border border-[var(--border)] px-3 text-sm disabled:opacity-30"
                >
                  ← Előző
                </button>
                <button
                  type="button"
                  disabled={index >= rows.length - 1}
                  onClick={() =>
                    setIndex((value) => Math.min(rows.length - 1, value + 1))
                  }
                  className="h-9 rounded-lg border border-[var(--border)] px-3 text-sm disabled:opacity-30"
                >
                  Következő →
                </button>
                <span className="text-xs text-[var(--muted)]">
                  {index + 1} / {rows.length}
                </span>

                {dirty[current.id] ? (
                  <button
                    type="button"
                    onClick={() => void saveCurrent()}
                    className="h-9 rounded-lg border border-amber-500/60 px-3 text-sm text-amber-300"
                  >
                    Módosítás mentése
                  </button>
                ) : null}

                <button
                  type="button"
                  disabled={busy || Boolean(working)}
                  onClick={onStart}
                  title={
                    unsaved
                      ? "Van nem mentett módosításod — az adatbázisban lévő szöveg megy ki."
                      : undefined
                  }
                  className="ml-auto h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  ✉️ Kiküldés indítása ({rows.length})
                </button>
              </div>
            </>
          ) : (
            <p className="m-auto text-sm text-[var(--muted)]">
              Nincs kiküldhető levél ebben a válogatásban.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
