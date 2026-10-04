"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { COUNTRY_LABELS } from "@/data";
import { KINDS, KIND_LABELS } from "@/lib/importSchema";
import { COMPANY_SIZES } from "@/lib/types";
import { useStatusPoll } from "./useStatusPoll";
import { formatNumber } from "@/lib/format";
import RunMessage from "./RunMessage";

interface EnrichItem {
  company: string;
  contactId: string | null;
  email: string | null;
  website: string | null;
  result: "talalat" | "nincs-cim" | "hiba";
  ms: number;
  message?: string;
}

interface EnrichState {
  status: "idle" | "running" | "stopping" | "done" | "error";
  provider: string;
  requested: number;
  skipped: number;
  created: number;
  total: number;
  processed: number;
  found: number;
  failed: number;
  current: string | null;
  etaSeconds: number | null;
  message: string | null;
  recent: EnrichItem[];
}

const PROVIDERS: { key: string; label: string; hint: string }[] = [
  { key: "claude", label: "Claude", hint: "helyi CLI, az előfizetésedből" },
  { key: "codex", label: "Codex", hint: "helyi CLI, ChatGPT-fiókkal" },
  { key: "openai", label: "OpenAI", hint: "API, cégenként pár cent" },
];

function eta(seconds: number | null): string {
  if (!seconds || seconds < 0) return "—";
  if (seconds < 90) return `${seconds} mp`;
  return `${Math.round(seconds / 60)} perc`;
}

/**
 * Hiányzó cégek felvétele puszta névből, majd feltöltésük adatokkal.
 *
 * A felvétel azonnal létrehozza a sorokat (levéllel együtt), a kutatás pedig
 * egyesével halad: megkeresi a publikus e-mail címet és a weboldalt, aztán a
 * megtalált adatokkal újraírja a levelet.
 */
export default function EnrichPanel({
  names,
  onFinished,
}: {
  /** Amit felveszünk — jellemzően a „nincs a listában" oszlop. */
  names: string[];
  onFinished?: () => void;
}) {
  const [source, setSource] = useState("kezi-felvetel");
  const [kind, setKind] = useState<string>("it-company");
  // Névből felvett cégnél ezt tudjuk a legkevésbé — az "ismeretlen" sáv
  // őszintébb, mint egy tipp, és később szűrhető rá.
  const [size, setSize] = useState("ismeretlen");
  const [country, setCountry] = useState("INT");
  // Vegyes listánál az angol a biztonságos alapértelmezés.
  const [language, setLanguage] = useState("en");
  const [provider, setProvider] = useState("claude");
  // Egy menetben ennyit veszünk fel. Cégenként fél-egy perc a keresés, ezért
  // nagy listát adagolva érdemes: a menet végén a lista magától újraszámolódik.
  const [limit, setLimit] = useState(50);
  const [state, setState] = useState<EnrichState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const active = state?.status === "running" || state?.status === "stopping";

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/contacts/enrich", {
        cache: "no-store",
      });
      if (response.ok) setState((await response.json()) as EnrichState);
    } catch {
      // a következő kör újrapróbálja
    }
  }, []);

  // Csak futás közben pollolunk; nyugalomban induláskor és fókuszváltáskor.
  useStatusPoll(refresh, active, 2000);

  // A lista csak a menet végén frissüljön, ne minden körben. Refben tartjuk:
  // a szülő visszahívása rendernként új, állapotot pedig nem állítunk effektben.
  const finishedCallback = useRef(onFinished);
  useEffect(() => {
    finishedCallback.current = onFinished;
  });

  const wasActive = useRef(false);
  useEffect(() => {
    if (active) {
      wasActive.current = true;
      return;
    }
    if (wasActive.current) {
      wasActive.current = false;
      finishedCallback.current?.();
    }
  }, [active]);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/contacts/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hiba");
      setState(data as EnrichState);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const batch = names.slice(0, Math.max(1, limit));
  // Tapasztalati érték: a CLI-s keresés cégenként 30-60 másodperc, egyszerre egy fut.
  const estimate = Math.round((batch.length * 45) / 60);

  const start = () =>
    send({
      action: "start",
      names: batch,
      source,
      kind,
      size,
      country,
      language,
      provider,
    });

  return (
    <section className="space-y-3 rounded-xl border border-blue-500/40 bg-blue-500/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">
          Hiányzók felvétele és kutatása — {names.length} cég
        </h2>
        <span className="text-xs text-[var(--muted)]">
          felveszem a sorokat, majd egyesével megkeresem a címet és a weboldalt,
          és megírom a levelet
        </span>
        <span className="ml-auto text-xs text-[var(--muted)]">
          most {batch.length} megy · becsült idő ~{estimate} perc
          {names.length > batch.length
            ? ` · a maradék ${names.length - batch.length} a következő körben`
            : ""}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Egyszerre
          <input
            type="number"
            min={1}
            max={2000}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
            disabled={active}
            title="Ennyi céget vesz fel és kutat ki ebben a menetben. A többi marad a listában."
            className="h-9 w-20 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm normal-case text-foreground outline-none focus:border-blue-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Forrás
          <input
            value={source}
            onChange={(event) => setSource(event.target.value)}
            disabled={active}
            placeholder="kezi-felvetel"
            className="h-9 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm normal-case text-foreground outline-none focus:border-blue-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Típus
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            disabled={active}
            className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm normal-case text-foreground outline-none focus:border-blue-500"
          >
            {KINDS.map((item) => (
              <option key={item} value={item}>
                {KIND_LABELS[item]}
              </option>
            ))}
          </select>
        </label>

        {kind === "it-company" ? (
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Létszám
            <select
              value={size}
              onChange={(event) => setSize(event.target.value)}
              disabled={active}
              title="IT cégnél kötelező mező. Ha nem tudod, hagyd az alapértelmezetten — később javítható."
              className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm normal-case text-foreground outline-none focus:border-blue-500"
            >
              {COMPANY_SIZES.map((item) => (
                <option key={item} value={item}>
                  {item === "ismeretlen" ? "ismeretlen" : `${item} fő`}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Ország
          <select
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            disabled={active}
            className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm normal-case text-foreground outline-none focus:border-blue-500"
          >
            {Object.entries(COUNTRY_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Levél nyelve
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            disabled={active}
            className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm normal-case text-foreground outline-none focus:border-blue-500"
          >
            <option value="hu">magyar</option>
            <option value="en">angol</option>
          </select>
        </label>

        <div className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Kereső motor
          <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
            {PROVIDERS.map((item) => (
              <button
                key={item.key}
                type="button"
                disabled={active}
                onClick={() => setProvider(item.key)}
                title={item.hint}
                className={`h-9 px-3 text-xs normal-case transition ${
                  provider === item.key
                    ? "bg-blue-500/15 text-blue-200"
                    : "text-[var(--muted)] hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {active ? (
          <button
            type="button"
            disabled={busy || state?.status === "stopping"}
            onClick={() => void send({ action: "stop" })}
            className="h-9 rounded-lg border border-red-500/60 px-4 text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
          >
            {state?.status === "stopping" ? "Leáll…" : "Leállítás"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !names.length || !source.trim()}
            onClick={() => void start()}
            className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
          >
            Felveszem és kutatom ({batch.length})
          </button>
        )}
      </div>

      {error ? <p className="text-xs text-red-300">{error}</p> : null}

      {state && state.status !== "idle" ? (
        <div className="space-y-2 border-t border-[var(--border)] pt-2">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">
              {formatNumber(state.created)} új sor ·{" "}
              {formatNumber(state.processed)}/{formatNumber(state.total)}{" "}
              kutatva
            </span>
            <div className="h-2 min-w-[140px] flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{
                  width: `${state.total ? (state.processed / state.total) * 100 : 0}%`,
                }}
              />
            </div>
            <span className="text-xs text-[var(--muted)]">
              {formatNumber(state.found)} címmel
              {state.failed ? ` · ${state.failed} hiba` : ""}
              {state.skipped ? ` · ${state.skipped} már megvolt` : ""}
            </span>
          </div>

          {state.current ? (
            <p className="text-xs text-blue-300">
              <span className="animate-pulse">●</span> most: {state.current}
              {state.etaSeconds ? ` · hátra kb. ${eta(state.etaSeconds)}` : ""}
            </p>
          ) : null}
          <RunMessage
            status={state.status}
            message={state.message}
            scope="felvetel"
          />

          {state.recent.length ? (
            <div className="max-h-56 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 font-mono text-[11px]">
              {state.recent.map((item, index) => (
                <div
                  key={`${item.company}-${index}`}
                  className="flex flex-wrap items-center gap-2 border-b border-[var(--border)]/40 py-1"
                >
                  <span className="min-w-[180px]">{item.company}</span>
                  {item.result === "hiba" ? (
                    <span className="text-red-400">
                      hiba: {(item.message ?? "").slice(0, 60)}
                    </span>
                  ) : (
                    <>
                      <span
                        className={
                          item.email
                            ? "text-emerald-300"
                            : "text-[var(--muted)]"
                        }
                      >
                        {item.email ?? "nincs cím"}
                      </span>
                      {item.website ? (
                        <span className="text-[var(--muted)]">
                          {item.website}
                        </span>
                      ) : null}
                      <span className="text-[var(--muted)]">
                        {Math.round(item.ms / 1000)} mp
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          <Link
            href={`/?source=${encodeURIComponent(source)}&sort=newest`}
            className="inline-block text-xs text-blue-400 hover:underline"
          >
            A felvett sorok a listában ↗
          </Link>
        </div>
      ) : null}
    </section>
  );
}
