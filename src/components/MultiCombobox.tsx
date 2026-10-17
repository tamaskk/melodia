"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ComboOption } from "./Combobox";

/** Ékezet nélküli, kisbetűs alak — "szved" is találjon rá a "Svédország"-ra. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Kereshető, többválasztós legördülő. Minden sor előtt jelölőnégyzet;
 * kattintásra a lista nyitva marad, hogy egymás után több is bepipálható
 * legyen. A gépeléssel szűrt találatok egyben is kijelölhetők.
 */
export default function MultiCombobox({
  label,
  values,
  onChange,
  options,
  placeholder = "Mind",
  unit = "elem",
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: ComboOption[];
  placeholder?: string;
  /** A "3 … kiválasztva" felirat főneve. */
  unit?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const listId = useId();

  const chosen = useMemo(() => new Set(values), [values]);

  const summary =
    values.length === 0
      ? ""
      : values.length === 1
        ? (options.find((option) => option.value === values[0])?.label ??
          values[0])
        : `${values.length} ${unit} kiválasztva`;

  const matches = useMemo(() => {
    const needle = fold(query.trim());
    // A kijelöltek elöl, hogy nyitáskor rögtön látszódjanak.
    const sorted = [
      ...options.filter((option) => chosen.has(option.value)),
      ...options.filter((option) => !chosen.has(option.value)),
    ];
    if (!needle) return sorted;
    return sorted.filter((option) => {
      const hay = fold(
        `${option.label} ${option.keywords ?? ""} ${option.value}`,
      );
      // Minden begépelt szónak illeszkednie kell — "lengyel it" is működik.
      return needle.split(/\s+/).every((word) => hay.includes(word));
    });
    // A sorrendet csak nyitáskor rendezzük át, pipáláskor ne ugráljon a lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, query, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const toggle = (value: string) => {
    onChange(
      chosen.has(value)
        ? values.filter((current) => current !== value)
        : [...values, value],
    );
  };

  const allMatchesChosen =
    matches.length > 0 && matches.every((option) => chosen.has(option.value));

  const toggleMatches = () => {
    const keys = new Set(matches.map((option) => option.value));
    onChange(
      allMatchesChosen
        ? values.filter((value) => !keys.has(value))
        : [...new Set([...values, ...keys])],
    );
  };

  return (
    <div className="flex flex-col gap-1" ref={wrapper}>
      <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>

      <div className="relative">
        <input
          value={open ? query : summary}
          placeholder={open && summary ? summary : placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setActive(0);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((current) => {
                const next =
                  event.key === "ArrowDown" ? current + 1 : current - 1;
                return Math.max(0, Math.min(matches.length - 1, next));
              });
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              const option = matches[active];
              if (option) toggle(option.value);
              return;
            }
            if (event.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          className={`h-9 w-full rounded-lg border bg-[var(--surface)] px-2.5 pr-7 text-sm outline-none transition ${
            open
              ? "border-blue-500"
              : values.length
                ? "border-blue-500/50"
                : "border-[var(--border)]"
          }`}
        />

        {values.length && !open ? (
          <button
            type="button"
            aria-label="Szűrő törlése"
            onClick={() => onChange([])}
            className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 rounded text-[var(--muted)] transition hover:text-foreground"
          >
            ×
          </button>
        ) : (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[var(--muted)]">
            ▾
          </span>
        )}

        {open ? (
          <div className="absolute z-30 mt-1 w-full min-w-[280px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--muted)]">
              <button
                type="button"
                onClick={toggleMatches}
                disabled={matches.length === 0}
                className="transition hover:text-foreground disabled:opacity-40"
              >
                {allMatchesChosen
                  ? `${matches.length} találat kijelölésének törlése`
                  : `Mind a ${matches.length} találat kijelölése`}
              </button>
              {values.length ? (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="transition hover:text-foreground"
                >
                  Törlés ({values.length})
                </button>
              ) : null}
            </div>

            <div
              id={listId}
              role="listbox"
              aria-multiselectable="true"
              className="max-h-72 overflow-auto py-1"
            >
              {matches.length === 0 ? (
                <div className="px-3 py-2 text-xs text-[var(--muted)]">
                  Nincs találat erre: „{query}”
                </div>
              ) : null}

              {matches.map((option, index) => {
                const isChosen = chosen.has(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isChosen}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => toggle(option.value)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition ${
                      index === active ? "bg-blue-500/20" : ""
                    } ${isChosen ? "text-blue-300" : ""}`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none ${
                        isChosen
                          ? "border-blue-500 bg-blue-500 text-white"
                          : "border-[var(--border)]"
                      }`}
                    >
                      {isChosen ? "✓" : ""}
                    </span>
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-[var(--border)] px-3 py-1 text-[11px] text-[var(--muted)]">
              {matches.length} találat · Enter vagy kattintás a pipáláshoz
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
