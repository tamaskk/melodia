"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatNumber } from "@/lib/format";

interface Change {
  _id: string;
  contactId: string;
  company: string;
  field: string;
  before: unknown;
  after: unknown;
  source: string;
  at: string;
  reverted?: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  done: "kész",
  sent: "elküldve",
  starred: "csillagozott",
  primaryEmail: "e-mail cím",
  emails: "e-mail címek",
  emailSubject: "tárgy",
  emailBody: "levél szövege",
  linkedinMessage: "LinkedIn üzenet",
  connectionRequest: "kapcsolatkérés",
  kind: "típus",
  source: "forrás",
  size: "létszám",
  note: "megjegyzés",
  tags: "címkék",
  company: "cégnév",
  person: "kapcsolattartó",
  role: "pozíció",
  city: "város",
  country: "ország",
  language: "nyelv",
  category: "kategória",
  website: "weboldal",
  linkedinUrl: "LinkedIn",
  channel: "csatorna",
};

/** Rövid, olvasható alak — a hosszú levélszöveget nem öntjük a képernyőre. */
function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "igen" : "nem";
  if (Array.isArray(value)) return value.join(", ") || "—";
  const text = String(value);
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

export default function HistoryPanel() {
  const [changes, setChanges] = useState<Change[]>([]);
  const [facets, setFacets] = useState<{ fields: string[]; sources: string[] }>(
    {
      fields: [],
      sources: [],
    },
  );
  const [minutes, setMinutes] = useState(60);
  const [field, setField] = useState("");
  const [source, setSource] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (minutes > 0) params.set("minutes", String(minutes));
      if (field) params.set("field", field);
      if (source) params.set("source", source);
      const response = await fetch(`/api/history?${params}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Betöltési hiba");
      setChanges(data.changes as Change[]);
      setFacets(data.facets);
      setSelected(new Set());
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [field, minutes, source]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const revert = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Visszaállítási hiba");
      setMessage(
        `${data.reverted} változás visszaállítva` +
          (data.skipped ? ` · ${data.skipped} kihagyva` : ""),
      );
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const open = useMemo(
    () => changes.filter((change) => !change.reverted),
    [changes],
  );

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Változásnapló</h1>
          <p className="max-w-2xl text-sm text-[var(--muted)]">
            Minden mezőmódosítás nyoma, előtte/utána értékkel — és bármelyik
            visszaállítható. A bejegyzések 30 nap után maguktól törlődnek.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <select
          value={minutes}
          onChange={(event) => setMinutes(Number(event.target.value))}
          className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm outline-none focus:border-blue-500"
        >
          <option value={10}>utolsó 10 perc</option>
          <option value={60}>utolsó óra</option>
          <option value={1440}>utolsó nap</option>
          <option value={10080}>utolsó hét</option>
          <option value={0}>mind</option>
        </select>

        <select
          value={field}
          onChange={(event) => setField(event.target.value)}
          className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm outline-none focus:border-blue-500"
        >
          <option value="">minden mező</option>
          {facets.fields.map((value) => (
            <option key={value} value={value}>
              {FIELD_LABELS[value] ?? value}
            </option>
          ))}
        </select>

        <select
          value={source}
          onChange={(event) => setSource(event.target.value)}
          className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm outline-none focus:border-blue-500"
        >
          <option value="">minden forrás</option>
          {facets.sources.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => void load()}
          className="h-9 rounded-lg border border-[var(--border)] px-3 text-sm transition hover:border-blue-500"
        >
          Frissítés
        </button>

        <button
          type="button"
          disabled={busy || open.length === 0}
          onClick={() => void revert(open.map((change) => change._id))}
          className="h-9 rounded-lg border border-amber-500/60 px-3 text-sm text-amber-300 transition hover:bg-amber-500/10 disabled:opacity-40"
          title="A szűrésben látszó összes változás visszaállítása."
        >
          Mind visszaállítása ({formatNumber(open.length)})
        </button>

        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => void revert([...selected])}
          className="h-9 rounded-lg bg-amber-600 px-4 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-40"
        >
          Kijelöltek visszaállítása ({formatNumber(selected.size)})
        </button>

        <span className="ml-auto text-xs text-[var(--muted)]">
          {formatNumber(changes.length)} bejegyzés
        </span>
      </div>

      {message ? (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-[var(--surface-2)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
            <tr>
              <th className="w-10 px-3 py-2"> </th>
              <th className="px-3 py-2">Mikor</th>
              <th className="px-3 py-2">Cég</th>
              <th className="px-3 py-2">Mező</th>
              <th className="px-3 py-2">Előtte</th>
              <th className="px-3 py-2">Utána</th>
              <th className="px-3 py-2">Forrás</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((change) => (
              <tr
                key={change._id}
                className={`border-t border-[var(--border)] ${
                  change.reverted ? "opacity-50" : ""
                }`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(change._id)}
                    disabled={change.reverted}
                    onChange={() => toggle(change._id)}
                    className="size-4 accent-amber-500"
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--muted)]">
                  {new Date(change.at).toLocaleString("hu-HU")}
                </td>
                <td className="px-3 py-2">{change.company}</td>
                <td className="px-3 py-2">
                  {FIELD_LABELS[change.field] ?? change.field}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--muted)]">
                  {show(change.before)}
                </td>
                <td className="px-3 py-2 text-xs">{show(change.after)}</td>
                <td className="px-3 py-2 text-xs text-[var(--muted)]">
                  {change.source}
                  {change.reverted ? (
                    <span className="ml-1 text-emerald-400">
                      · visszaállítva
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {changes.length === 0 ? (
          <p className="p-6 text-center text-sm text-[var(--muted)]">
            Ebben az időszakban nincs változás.
          </p>
        ) : null}
      </div>
    </div>
  );
}
