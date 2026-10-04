"use client";

import { useState } from "react";
import Link from "next/link";
import { COUNTRY_LABELS } from "@/data";
import EnrichPanel from "./EnrichPanel";
import { formatNumber } from "@/lib/format";
import { button } from "./ui";

interface Hit {
  name: string;
  company: string;
  country: string;
  primaryEmail: string | null;
  sent: boolean;
  done: boolean;
  source: string;
  id: string;
}

interface Result {
  total: number;
  duplicates: string[];
  found: Hit[];
  missing: string[];
  truncated?: number;
}

/**
 * Kipróbáláshoz: három cég, ami biztosan bent van, és kettő, ami biztosan
 * nincs — így egy kattintással látszik, mit ad vissza az oldal.
 */
const SAMPLE = `["Chemaxon Kft.", "BDO Hungary", "Booked4.us", "Kitalált Szoftver Zrt.", "Példa Nemlétező Kft."]`;

const PLACEHOLDER = `["Példa Tech Kft.", "Másik Cég", "Harmadik Zrt."]

vagy soronként egy név:
Példa Tech Kft.
Másik Cég`;

/** Fájl letöltése a böngészőből — nincs hozzá szerver. */
function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Cégellenőrzés: beillesztesz egy névlistát, és megmondja, melyik van már a
 * listában és melyik nincs. A hiányzókat egy gombbal exportálod — azokkal
 * érdemes tovább dolgozni.
 */
export default function CompanyCheck() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const response = await fetch("/api/contacts/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hiba");
      setResult(data as Result);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const missing = result?.missing ?? [];

  const copyMissing = async () => {
    await navigator.clipboard.writeText(JSON.stringify(missing, null, 2));
    setNote(`${missing.length} hiányzó név a vágólapon.`);
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cégellenőrzés</h1>
          <p className="text-sm text-[var(--muted)]">
            Illessz be egy cégnév-listát, és megmondom, melyik van már az
            adatbázisban és melyik nincs. Az egyeztetés a jogi forma nélküli
            alakra megy: a {'„Példa Tech Kft."'} és a {'„Példa Tech"'} ugyanaz.
          </p>
        </div>
      </header>

      <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          rows={10}
          className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 font-mono text-sm outline-none focus:border-blue-500"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={() => void run()}
            className={button("primary", "md")}
          >
            {busy ? "Ellenőrzés…" : "Ellenőrzés"}
          </button>
          <button
            type="button"
            onClick={() => {
              setText("");
              setResult(null);
              setError(null);
              setNote(null);
            }}
            className={button("ghost", "md")}
          >
            Ürítés
          </button>
          {!text.trim() ? (
            <button
              type="button"
              onClick={() => setText(SAMPLE)}
              className={`${button("secondary", "md")} border-dashed text-[var(--muted)]`}
              title="Három meglévő és két kitalált cégnév — hogy lásd, mit ad vissza"
            >
              Minta kipróbálása
            </button>
          ) : null}
          <span className="text-xs text-[var(--muted)]">
            JSON tömb, soronkénti lista vagy vesszős felsorolás — mind jó.
          </span>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {note}
        </p>
      ) : null}

      {result ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Beillesztve", result.total, ""],
              ["Már megvan", result.found.length, "text-amber-300"],
              ["Hiányzik", result.missing.length, "text-emerald-300"],
              ["Ismétlődés", result.duplicates.length, "text-[var(--muted)]"],
            ].map(([label, value, tone]) => (
              <div
                key={label as string}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              >
                <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  {label}
                </p>
                <p
                  className={`text-xl font-semibold tabular-nums ${tone as string}`}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>

          {result.truncated ? (
            <p className="text-xs text-amber-300">
              {result.truncated} nevet nem néztem meg — egyszerre legfeljebb
              5000 fér bele.
            </p>
          ) : null}

          {missing.length ? (
            <EnrichPanel
              names={missing}
              // A kutatás módosítja a sorokat: a végén nézzük meg újra, mi maradt ki.
              onFinished={() => void run()}
            />
          ) : null}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <section className="min-h-[200px] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <header className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
                <h2 className="text-sm font-semibold text-emerald-300">
                  Nincs a listában — {formatNumber(result.missing.length)}
                </h2>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={!missing.length}
                    onClick={() =>
                      download(
                        `hianyzo-cegek-${stamp()}.json`,
                        JSON.stringify(missing, null, 2),
                        "application/json",
                      )
                    }
                    className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
                  >
                    Export JSON
                  </button>
                  <button
                    type="button"
                    disabled={!missing.length}
                    onClick={() =>
                      download(
                        `hianyzo-cegek-${stamp()}.csv`,
                        // Idézőjelezve, hogy a vesszős cégnév se törje el a CSV-t.
                        [
                          "company",
                          ...missing.map(
                            (name) => `"${name.replace(/"/g, '""')}"`,
                          ),
                        ].join("\n"),
                        "text/csv;charset=utf-8",
                      )
                    }
                    className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs transition hover:border-emerald-500 disabled:opacity-40"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    disabled={!missing.length}
                    onClick={() => void copyMissing()}
                    className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs transition hover:border-emerald-500 disabled:opacity-40"
                  >
                    Másolás
                  </button>
                </div>
              </header>
              {missing.length ? (
                <ol className="max-h-[420px] list-decimal space-y-0.5 overflow-auto py-2 pl-10 pr-3 font-mono text-xs">
                  {missing.map((name) => (
                    <li key={name} className="text-emerald-200">
                      {name}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="p-3 text-sm text-[var(--muted)]">
                  Minden beillesztett cég szerepel már az adatbázisban.
                </p>
              )}
            </section>

            <section className="min-h-[200px] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <header className="border-b border-[var(--border)] px-3 py-2">
                <h2 className="text-sm font-semibold text-amber-300">
                  Már a listában van — {formatNumber(result.found.length)}
                </h2>
              </header>
              {result.found.length ? (
                <ul className="max-h-[420px] divide-y divide-[var(--border)] overflow-auto">
                  {result.found.map((hit) => (
                    <li key={hit.id} className="space-y-0.5 px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/?q=${encodeURIComponent(hit.company)}`}
                          className="font-medium text-blue-300 hover:underline"
                        >
                          {hit.company}
                        </Link>
                        <span className="text-[var(--muted)]">
                          {COUNTRY_LABELS[hit.country] ?? hit.country}
                        </span>
                        {hit.sent ? (
                          <span className="rounded-full bg-blue-500/15 px-2 text-blue-300">
                            elküldve
                          </span>
                        ) : null}
                        {hit.done ? (
                          <span className="rounded-full bg-emerald-500/15 px-2 text-emerald-300">
                            kész
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[var(--muted)]">
                        <span className="font-mono">
                          {hit.primaryEmail ?? "nincs cím"}
                        </span>
                        {hit.name.toLowerCase() !==
                        hit.company.toLowerCase() ? (
                          <span>· beillesztve: {hit.name}</span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-3 text-sm text-[var(--muted)]">
                  Egyik beillesztett cég sincs még az adatbázisban.
                </p>
              )}
            </section>
          </div>

          {result.duplicates.length ? (
            <p className="text-xs text-[var(--muted)]">
              A bemenetben ismétlődött:{" "}
              {result.duplicates.slice(0, 12).join(", ")}
              {result.duplicates.length > 12
                ? ` (+${result.duplicates.length - 12})`
                : ""}
            </p>
          ) : null}
        </>
      ) : (
        // Üres állapot: mit kapsz, ha beillesztesz egy listát.
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          {[
            [
              "Megvan",
              "A már bent lévő cégek, a sorukra mutató linkkel — nem keresed meg őket kétszer.",
            ],
            [
              "Hiányzik",
              "Amit még nem ismerünk: egy gombbal exportálható, vagy felvehető a listára.",
            ],
            [
              "Felvétel + kutatás",
              "A hiányzókat egyesével felveszi, megkeresi a weboldalt, a címet, és megírja a levelet.",
            ],
          ].map(([title, body]) => (
            <div key={title} className="space-y-1 px-1">
              <div className="font-medium">{title}</div>
              <p className="text-[var(--muted)]">{body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
