"use client";

import { Fragment, useEffect, useState } from "react";
import JevSweepPanel from "./JevSweepPanel";
import JevWebPanel from "./JevWebPanel";

interface JevRun {
  state: string;
  question: string;
  probability: number;
  elapsedMs: number;
  cost: number | null;
  inputTokens: number | null;
  modelId: string;
  responseId: string | null;
  timestamp: string;
  warnings: unknown[];
  providerMetadata: unknown;
}

interface Row extends JevRun {
  id: number;
  /** A böngészőből mért teljes idő: a mi szerverünk + a gateway. */
  roundTripMs: number;
}

const QUESTION = "Was a refund issued?";

const PRESETS = [
  "The support agent issued a full refund to the customer.",
  "The customer requested a refund, but the agent has not processed it.",
];

function formatCost(cost: number | null): string {
  if (cost == null) return "nem jelezte";
  return `$${cost.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")}`;
}

/**
 * JEV: igen/nem döntés egy szöveges állapotra a Jev modellel (Vercel AI
 * Gateway). Minden visszajött válasz sorként kerül a táblázatba, nyers
 * metaadattal együtt.
 */
export default function JevPanel() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [state, setState] = useState(PRESETS[0]);
  const [question, setQuestion] = useState(QUESTION);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [mode, setMode] = useState<"web" | "db">("web");

  useEffect(() => {
    let alive = true;
    fetch("/api/jev")
      .then((response) => response.json())
      .then((data: { ready?: boolean }) => {
        if (alive) setReady(Boolean(data.ready));
      })
      .catch(() => {
        if (alive) setReady(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function ask(stateText: string, questionText: string) {
    const started = performance.now();
    const response = await fetch("/api/jev", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: stateText, question: questionText }),
    });
    const data = (await response.json()) as JevRun & { error?: string };
    if (!response.ok || data.error) {
      throw new Error(data.error ?? `HTTP ${response.status}`);
    }
    const row: Row = {
      ...data,
      id: Date.now() + Math.random(),
      roundTripMs: Math.round(performance.now() - started),
    };
    setRows((current) => [row, ...current]);
  }

  async function run(states: string[]) {
    setBusy(true);
    setError("");
    try {
      // Sorban, hogy az időmérések ne zavarják egymást.
      for (const item of states) await ask(item, question);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-6 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">JEV import</h1>
        <p className="text-sm text-[var(--muted)]">
          Igen/nem döntés egy szöveges állapotra a <code>typesafe-ai/jev</code>{" "}
          modellel, a Vercel AI Gatewayen át. Minden válasz bekerül a
          táblázatba.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Honnan keressen"
        className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1"
      >
        {(
          [
            ["web", "Internet"],
            ["db", "Adatbázis"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`h-8 rounded-md px-4 text-sm transition ${
              mode === value
                ? "bg-blue-600 text-white"
                : "text-[var(--muted)] hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Mindkettő mountolva marad, hogy a futás állapota ne vesszen el váltáskor. */}
      <div hidden={mode !== "web"}>
        <JevWebPanel />
      </div>
      <div hidden={mode !== "db"}>
        <JevSweepPanel />
      </div>

      <h2 className="pt-2 text-lg font-semibold">Kézi próba</h2>

      {ready === false ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Nincs <code>AI_GATEWAY_API_KEY</code> az{" "}
          <code>atlas-credentials.env</code> fájlban. Tedd bele egy sorba (
          <code>AI_GATEWAY_API_KEY=…</code>), majd indítsd újra a dev szervert.
        </div>
      ) : null}

      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <label className="block space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Állapot (state)
          </span>
          <textarea
            value={state}
            onChange={(event) => setState(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset, index) => (
            <button
              key={preset}
              type="button"
              onClick={() => setState(preset)}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] transition hover:text-foreground"
            >
              {index + 1}. teszt: {preset.slice(0, 48)}…
            </button>
          ))}
        </div>
        <label className="block space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Igen/nem kérdés
          </span>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm outline-none focus:border-blue-500"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || !state.trim() || !question.trim()}
            onClick={() => run([state])}
            className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? "Fut…" : "Kérdezés"}
          </button>
          <button
            type="button"
            disabled={busy || !question.trim()}
            onClick={() => run(PRESETS)}
            className="h-9 rounded-lg border border-[var(--border)] px-4 text-sm transition hover:border-blue-500 disabled:opacity-50"
          >
            Mindkét teszt futtatása
          </button>
          {rows.length ? (
            <button
              type="button"
              onClick={() => setRows([])}
              className="ml-auto text-xs text-[var(--muted)] transition hover:text-foreground"
            >
              Táblázat ürítése
            </button>
          ) : null}
        </div>
        {error ? (
          <p className="whitespace-pre-wrap rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}
      </section>

      <section className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-2)] text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Idő</th>
              <th className="px-3 py-2">Állapot</th>
              <th className="px-3 py-2">Kérdés</th>
              <th className="px-3 py-2">Valószínűség</th>
              <th className="px-3 py-2">Gateway-idő</th>
              <th className="px-3 py-2">Teljes idő</th>
              <th className="px-3 py-2">Költség</th>
              <th className="px-3 py-2">Input token</th>
              <th className="px-3 py-2">Modell</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-6 text-center text-[var(--muted)]"
                >
                  Még nincs eredmény.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr className="border-t border-[var(--border)] align-top">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--muted)]">
                    {new Date(row.timestamp).toLocaleTimeString("hu-HU")}
                  </td>
                  <td className="max-w-xs px-3 py-2">{row.state}</td>
                  <td className="max-w-[12rem] px-3 py-2 text-[var(--muted)]">
                    {row.question}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    <span
                      className={
                        row.probability >= 0.5
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
                      {row.probability.toFixed(2)} ·{" "}
                      {row.probability >= 0.5 ? "igen" : "nem"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {row.elapsedMs} ms
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {row.roundTripMs} ms
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {formatCost(row.cost)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.inputTokens ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--muted)]">
                    {row.modelId}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setOpen(open === row.id ? null : row.id)}
                      className="text-xs text-blue-400 hover:underline"
                    >
                      {open === row.id ? "Bezár" : "Nyers adat"}
                    </button>
                  </td>
                </tr>
                {open === row.id ? (
                  <tr className="border-t border-[var(--border)] bg-[var(--surface-2)]">
                    <td colSpan={10} className="px-3 py-2">
                      <pre className="max-h-80 overflow-auto text-xs">
                        {JSON.stringify(
                          {
                            responseId: row.responseId,
                            warnings: row.warnings,
                            providerMetadata: row.providerMetadata,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-[var(--muted)]">
        Gateway-idő: a mi szerverünkön mért hívás a gatewayig és vissza. Teljes
        idő: a böngészőből mérve, a saját szerverünkkel együtt. A költség csak
        akkor látszik, ha a gateway visszaküldi.
      </p>
    </div>
  );
}
