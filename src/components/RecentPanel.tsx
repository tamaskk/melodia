"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";
import type { RecentSearch } from "@/lib/contacts";
import { button, field } from "./ui";

const PAGE_SIZE = 50;
/** Ennyi időnként magától frissül — a bot futását így élőben lehet követni. */
const REFRESH_MS = 30_000;

const TONES = {
  saved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  hint: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  none: "border-[var(--border)] text-[var(--muted)]",
} as const;

/** Mi lett a keresésből: beírt cím, csak javaslat, vagy semmi. */
function outcome(row: RecentSearch): { label: string; tone: keyof typeof TONES } {
  // A cím a keresés fő találata vagy egy utólag elfogadott javaslat is lehet.
  if (row.primaryEmail) return { label: "cím beírva", tone: "saved" };
  if (row.email) return { label: "cím javaslat", tone: "hint" };
  if (row.alternatives > 0) return { label: "csak további cím", tone: "hint" };
  if (row.applyUrl) return { label: "csak űrlap", tone: "hint" };
  return { label: "semmi", tone: "none" };
}

function when(at: string): string {
  return new Date(at).toLocaleString("hu-HU", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function RecentPanel() {
  const [rows, setRows] = useState<RecentSearch[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [withEmail, setWithEmail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Elavult válasz ne írja felül a frisset.
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (withEmail) params.set("withEmail", "1");
      const response = await fetch(`/api/contacts/recent?${params}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Betöltési hiba");
      if (request !== requestRef.current) return;
      setRows(data.rows as RecentSearch[]);
      setTotal(data.total as number);
    } catch (caught) {
      if (request === requestRef.current) setError((caught as Error).message);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [page, withEmail]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Legutóbbi keresések</h1>
          <p className="max-w-2xl text-sm text-[var(--muted)]">
            Melyik céghez mit mentett a keresés vagy a bot — a legfrissebb elöl.
            Fél percenként magától frissül.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Szűrés"
            value={withEmail ? "email" : "all"}
            onChange={(event) => {
              setWithEmail(event.target.value === "email");
              setPage(0);
            }}
            className={field("sm")}
          >
            <option value="all">Minden keresés</option>
            <option value="email">Csak ahol van cím</option>
          </select>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className={button("secondary")}
          >
            {loading ? "Frissítés…" : "Frissítés"}
          </button>
        </div>
      </header>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-left text-sm max-sm:block sm:min-w-[900px]">
          <thead className="text-[11px] uppercase tracking-wider text-[var(--muted)] max-sm:hidden">
            <tr className="border-b border-[var(--border)]">
              <th className="px-3 py-2 font-medium">Mikor</th>
              <th className="px-3 py-2 font-medium">Cég</th>
              <th className="px-3 py-2 font-medium">Eredmény</th>
              <th className="px-3 py-2 font-medium">Cím</th>
              <th className="px-3 py-2 font-medium">Emberek</th>
              <th className="px-3 py-2 font-medium">Jegyzet</th>
            </tr>
          </thead>
          {/* Telefonon a sorok kártyák, vízszintes görgetés nélkül. */}
          <tbody className="max-sm:block">
            {rows.map((row) => {
              const result = outcome(row);
              const email = row.primaryEmail ?? row.email;
              return (
                <tr key={row._id} className="border-b border-[var(--border)] align-top last:border-0 max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-1.5 max-sm:p-3">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--muted)] max-sm:block max-sm:p-0 max-sm:[&>span]:ml-2 max-sm:[&>span]:inline">
                    {when(row.emailSearchedAt)}
                    <span className="block">{row.model ?? "—"}</span>
                  </td>
                  <td className="px-3 py-2 max-sm:block max-sm:p-0 max-sm:order-first max-sm:w-full max-sm:font-medium">
                    {row.website ? (
                      <a
                        href={row.website}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-blue-300"
                      >
                        {row.company}
                      </a>
                    ) : (
                      row.company
                    )}
                    <span className="block text-xs text-[var(--muted)]">{row.country}</span>
                  </td>
                  <td className="px-3 py-2 max-sm:block max-sm:p-0">
                    <span
                      className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${TONES[result.tone]}`}
                    >
                      {result.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-sm:block max-sm:p-0 max-sm:w-full max-sm:break-all">
                    {email ?? "—"}
                    <span className="block text-xs text-[var(--muted)]">
                      {[
                        row.email ? row.confidence : null,
                        row.alternatives ? `+${row.alternatives} további` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {row.source?.startsWith("http") ? (
                        <>
                          {" "}
                          <a
                            href={row.source}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-blue-300"
                          >
                            forrás ↗
                          </a>
                        </>
                      ) : null}
                      {row.applyUrl?.startsWith("http") ? (
                        <>
                          {" "}
                          <a
                            href={row.applyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-blue-300"
                          >
                            űrlap ↗
                          </a>
                        </>
                      ) : null}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 max-sm:block max-sm:p-0 max-sm:text-xs max-sm:text-[var(--muted)] max-sm:before:content-['emberek:_']">
                    {row.people ? `${row.people} fő` : row.peopleSearchedAt ? "nincs" : "—"}
                  </td>
                  <td className="max-w-md px-3 py-2 text-xs text-[var(--muted)] max-sm:block max-sm:p-0 max-sm:w-full">
                    {row.notes ?? "—"}
                  </td>
                </tr>
              );
            })}
            {!rows.length && !loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[var(--muted)] max-sm:block max-sm:w-full">
                  Még nem futott keresés.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted)]">
        <span>
          {formatNumber(total)} keresett cég · {page + 1}. / {formatNumber(pageCount)} oldal
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            className={button("secondary")}
          >
            ← Újabbak
          </button>
          <button
            type="button"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((current) => current + 1)}
            className={button("secondary")}
          >
            Régebbiek →
          </button>
        </div>
      </footer>
    </div>
  );
}
