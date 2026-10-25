"use client";

import { useEffect, useState } from "react";
import type { AttachmentChoice } from "@/lib/attachmentIndex";
import type { ReplyAttachments, ReplyLanguage } from "@/lib/replyAttachments";

const LANGUAGES: [ReplyLanguage, string][] = [
  ["hu", "Magyar válasz"],
  ["en", "Angol (és minden más) válasz"],
];

/** Beállítások menü: a Válasz-ház piszkozataihoz nyelvenként melyik fájl megy. */
export default function ReplyAttachmentSettings() {
  const [value, setValue] = useState<ReplyAttachments | null>(null);
  const [files, setFiles] = useState<AttachmentChoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch("/api/mail/reply-attachments", { cache: "no-store" })
        .then((response) => response.json())
        .then((data) => {
          if (data.error) throw new Error(data.error);
          setValue(data.value);
          setFiles(data.files ?? []);
        })
        .catch((caught: Error) => setError(caught.message));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const choose = async (language: ReplyLanguage, key: string) => {
    if (!value) return;
    const next = { ...value, [language]: key || null };
    setValue(next);
    setError(null);
    try {
      const response = await fetch("/api/mail/reply-attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Nem sikerült menteni.");
      setValue(data.value);
    } catch (caught) {
      setValue(value);
      setError((caught as Error).message);
    }
  };

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
        Válaszlevél csatolmánya
      </legend>
      {LANGUAGES.map(([language, label]) => {
        const current = value?.[language] ?? "";
        const missing = current && !files.some((file) => file.key === current);
        return (
          <label key={language} className="block space-y-0.5 text-xs">
            <span className="text-[var(--muted)]">{label}</span>
            <select
              value={current}
              disabled={!value}
              onChange={(event) => void choose(language, event.target.value)}
              className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
            >
              <option value="">Nincs csatolmány</option>
              {missing ? (
                <option value={current}>⚠ {current} (nincs a mappában)</option>
              ) : null}
              {files.map((file) => (
                <option key={file.key} value={file.key}>
                  {file.key}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      {error ? (
        <p role="alert" className="text-[11px] text-red-300">
          {error}
        </p>
      ) : (
        <p className="text-[11px] text-[var(--muted)]">
          A válasz nyelvét a beérkezett levél dönti el. A Levelezésben kézzel
          választott csatolmány felülírja.
        </p>
      )}
    </fieldset>
  );
}
