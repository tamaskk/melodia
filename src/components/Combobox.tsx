"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface ComboOption {
  value: string;
  label: string;
  /** További szavak, amikre illeszkedjen a gépelés (pl. nyers kulcs). */
  keywords?: string;
}

/** Ékezet nélküli, kisbetűs alak — "szved" is találjon rá a "Svédország"-ra. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Kereshető legördülő. Gépelésre szűr, billentyűvel is járható, és a natívtól
 * eltérően a hosszú listákban (forrás, ország, város, címke) is használható.
 */
export default function Combobox({
  label,
  value,
  onChange,
  options,
  placeholder = "Mind",
  emptyLabel = "Mind",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  /** A "nincs szűrés" sor felirata. */
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((option) => option.value === value);

  const matches = useMemo(() => {
    const needle = fold(query.trim());
    const all: ComboOption[] = [{ value: "", label: emptyLabel }, ...options];
    if (!needle) return all;
    return all.filter((option) => {
      if (!option.value) return false; // üres sor csak szűretlen listában kell
      const hay = fold(`${option.label} ${option.keywords ?? ""} ${option.value}`);
      // Minden begépelt szónak illeszkednie kell — "lengyel it" is működik.
      return needle.split(/\s+/).every((word) => hay.includes(word));
    });
  }, [emptyLabel, options, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const choose = (option: ComboOption) => {
    onChange(option.value);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1" ref={wrapper}>
      <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>

      <div className="relative">
        <input
          value={open ? query : (selected?.label ?? "")}
          placeholder={selected ? selected.label : placeholder}
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
                const next = event.key === "ArrowDown" ? current + 1 : current - 1;
                return Math.max(0, Math.min(matches.length - 1, next));
              });
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              const option = matches[active];
              if (option) choose(option);
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
              : value
                ? "border-blue-500/50"
                : "border-[var(--border)]"
          }`}
        />

        {value && !open ? (
          <button
            type="button"
            aria-label="Szűrő törlése"
            onClick={() => onChange("")}
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
          <div
            id={listId}
            role="listbox"
            className="absolute z-30 mt-1 max-h-72 w-full min-w-[240px] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] py-1 shadow-xl"
          >
            {matches.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--muted)]">
                Nincs találat erre: „{query}”
              </div>
            ) : null}

            {matches.map((option, index) => (
              <button
                key={option.value || "__all"}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition ${
                  index === active ? "bg-blue-500/20" : ""
                } ${option.value === value ? "text-blue-300" : ""}`}
              >
                <span className="truncate">{option.label}</span>
                {option.value === value ? <span className="text-xs">✓</span> : null}
              </button>
            ))}

            {query.trim() ? (
              <div className="border-t border-[var(--border)] px-3 py-1 text-[11px] text-[var(--muted)]">
                {matches.length} találat · Enter a kiválasztáshoz
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
