"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaceSuggestion } from "@/lib/jobs/jobassist/filters";
import { CARD } from "./ui";

/** Ennyi tétlenség után megy ki a keresés — gépelés közben nem hívunk. */
const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

const icon = (place: PlaceSuggestion) =>
  place.kind === "country" ? "⚑" : "📍";

/**
 * Hely-kereső lenyíló listával: bármely város vagy ország kereshető, a
 * kiválasztottak címkeként jelennek meg.
 */
export default function LocationAutocomplete({
  selected,
  onChange,
}: {
  selected: PlaceSuggestion[];
  onChange: (next: PlaceSuggestion[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Elavult válasz ne írja felül a frisset.
  const requestRef = useRef(0);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const lookup = (text: string) => {
    setDraft(text);
    setOpen(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    const request = ++requestRef.current;
    const q = text.trim();
    if (q.length < MIN_CHARS) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      let places: PlaceSuggestion[] = [];
      try {
        const response = await fetch(
          `/api/jobs/places?q=${encodeURIComponent(q)}`,
        );
        places = ((await response.json()).places as PlaceSuggestion[]) ?? [];
      } catch {
        // Hálózati hibánál üres a lista — a szűrő nélküle is használható.
      }
      if (request !== requestRef.current) return;
      setResults(places);
      setLoading(false);
    }, DEBOUNCE_MS);
  };

  const idOf = (place: PlaceSuggestion) =>
    `${place.kind}:${place.name.toLowerCase()}`;

  const add = (place: PlaceSuggestion) => {
    if (!selected.some((item) => idOf(item) === idOf(place))) {
      onChange([...selected, place]);
    }
    requestRef.current++;
    setDraft("");
    setResults([]);
    setLoading(false);
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 focus-within:border-blue-500">
        {selected.map((place, index) => (
          <span
            key={idOf(place)}
            className="flex min-w-0 items-center gap-1 rounded bg-[var(--background)] px-2 py-0.5 text-[13px]"
          >
            <span className="text-[var(--muted)]">{icon(place)}</span>
            <span className="truncate">{place.label}</span>
            <button
              type="button"
              onClick={() => onChange(selected.filter((_, i) => i !== index))}
              aria-label={`${place.label} törlése`}
              className="text-[var(--muted)] hover:text-foreground"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => lookup(event.target.value)}
          onFocus={() => setOpen(true)}
          // Késleltetve zár, hogy a listára kattintás még célba érjen.
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          aria-label="Hely"
          placeholder={selected.length ? "" : "Bármely város vagy ország…"}
          className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm outline-none"
        />
      </div>

      {open && draft.trim().length >= MIN_CHARS ? (
        <ul
          className={`${CARD} absolute z-10 mt-1 max-h-72 w-full overflow-y-auto p-1 shadow-xl`}
        >
          {loading ? (
            <li className="px-2.5 py-1.5 text-[13px] text-[var(--muted)]">
              Keresés…
            </li>
          ) : null}
          {!loading && results.length === 0 ? (
            <li className="px-2.5 py-1.5 text-[13px] text-[var(--muted)]">
              Nincs találat.
            </li>
          ) : null}
          {results.map((place) => (
            <li key={`${place.kind}:${place.label}`}>
              <button
                type="button"
                // mousedown + preventDefault: a mező fókuszvesztése ne előzze meg.
                onMouseDown={(event) => {
                  event.preventDefault();
                  add(place);
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm hover:bg-blue-500/15"
              >
                <span className="text-[var(--muted)]">{icon(place)}</span>
                <span className="flex-1 truncate">{place.label}</span>
                <span className="text-[11px] text-[var(--muted)]">
                  {place.kind === "country" ? "ország" : "hely"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
