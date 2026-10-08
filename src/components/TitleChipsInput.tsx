"use client";

import { useState, type KeyboardEvent } from "react";

/**
 * Többértékű szövegbevitel: az Enter vagy a vessző címkévé teszi a beírt
 * szöveget, a címkén az × törli, üres mezőben a Backspace az utolsót veszi le.
 */
export default function TitleChipsInput({
  values,
  onChange,
  placeholder,
  label,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  label: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    // Egy beírásból több érték is jöhet, ha vesszős szöveget illesztettek be.
    const merged = [...values];
    for (const part of raw.split(",").map((p) => p.trim())) {
      const known = merged.some((v) => v.toLowerCase() === part.toLowerCase());
      if (part && !known) merged.push(part);
    }
    if (merged.length !== values.length) onChange(merged);
    setDraft("");
  };

  const remove = (index: number) =>
    onChange(values.filter((_, i) => i !== index));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      // Az Enter itt címkét vesz fel, nem az űrlapot küldi el.
      event.preventDefault();
      if (draft.trim()) add(draft);
    } else if (event.key === "Backspace" && !draft && values.length) {
      remove(values.length - 1);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 focus-within:border-blue-500">
      {values.map((value, index) => (
        <span
          key={value}
          className="flex min-w-0 items-center gap-1 rounded bg-blue-500/15 px-2 py-0.5 text-[13px] text-blue-200"
        >
          <span className="truncate">{value}</span>
          <button
            type="button"
            onClick={() => remove(index)}
            aria-label={`${value} törlése`}
            className="text-blue-300 hover:text-white"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (draft.trim()) add(draft);
        }}
        aria-label={label}
        placeholder={values.length ? "" : placeholder}
        className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm outline-none"
      />
    </div>
  );
}
