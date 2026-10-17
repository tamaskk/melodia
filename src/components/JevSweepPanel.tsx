"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Combobox from "./Combobox";
import MultiCombobox from "./MultiCombobox";
import { SOURCE_LABELS, sourceLabel } from "@/data";
import { COUNTRIES, countryLabel } from "@/lib/countries";
import { KIND_LABELS } from "@/lib/importSchema";
import { formatNumber } from "@/lib/format";

interface JevResult {
  companyKey: string;
  question: string;
  contactId: string;
  company: string;
  website: string | null;
  country: string;
  source: string;
  state: string;
  probability: number;
  lead: boolean;
  threshold: number;
  cost: number | null;
  inputTokens: number | null;
  elapsedMs: number;
  evaluatedAt: string;
}

interface SweepState {
  status: "idle" | "running" | "stopping" | "done" | "error";
  question: string;
  processed: number;
  leads: number;
  failed: number;
  skipped: number;
  costTotal: number;
  startedAt: string | null;
  message: string | null;
  active: string[];
}

interface Payload {
  sweep: SweepState;
  items: JevResult[];
  total: number;
  leads: number;
}

const DEFAULT_QUESTION =
  "Is this company likely to hire a software developer (employee or contractor) in the next 6 months?";

const STATUS_LABEL: Record<SweepState["status"], string> = {
  idle: "Áll",
  running: "Fut",
  stopping: "Leáll…",
  done: "Kész",
  error: "Hiba miatt megállt",
};

/**
 * Folyamatos cégkeresés: a futás a szerveren megy végig az adatbázis cégein,
 * mindegyikre felteszi a kérdést, és egy cég egy kérdésre csak egyszer fut le.
 */
export default function JevSweepPanel() {
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [threshold, setThreshold] = useState("0.8");
  const [concurrency, setConcurrency] = useState("3");
  const [sources, setSources] = useState<string[]>([]);
  const [country, setCountry] = useState("");
  const [kind, setKind] = useState("");
  const [leadsOnly, setLeadsOnly] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  // Elavult válasz ne írja felül a frissebbet.
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    const params = new URLSearchParams({ question, limit: "200" });
    if (leadsOnly) params.set("leads", "1");
    try {
      const response = await fetch(`/api/jev/sweep?${params}`);
      const payload = (await response.json()) as Payload & { error?: string };
      if (id !== request.current) return;
      if (!response.ok)
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      setData(payload);
    } catch (caught) {
      if (id === request.current)
        setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [question, leadsOnly]);

  const running =
    data?.sweep.status === "running" || data?.sweep.status === "stopping";

  useEffect(() => {
    const first = setTimeout(load, 0);
    // Futás közben sűrűn, egyébként ritkán frissítünk.
    const timer = setInterval(load, running ? 2000 : 15000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load, running]);

  async function act(body: Record<string, unknown>) {
    setError("");
    const response = await fetch("/api/jev/sweep", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) setError(payload.error ?? `HTTP ${response.status}`);
    await load();
  }

  const sweep = data?.sweep;
  const sameQuestion = sweep?.question === question.trim();

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Folyamatos cégkeresés</h2>
          <p className="text-sm text-[var(--muted)]">
            Végigmegy az adatbázis cégein, és mindegyikre felteszi a kérdést.
            Egy cég egy kérdésre csak egyszer fut le — újraindítás után is
            mindig új cég jön.
          </p>
        </div>
        {sweep ? (
          <span
            className={`rounded-full px-3 py-1 text-xs ${
              sweep.status === "running"
                ? "bg-green-500/15 text-green-300"
                : sweep.status === "error"
                  ? "bg-red-500/15 text-red-300"
                  : "bg-[var(--surface-2)] text-[var(--muted)]"
            }`}
          >
            {STATUS_LABEL[sweep.status]}
          </span>
        ) : null}
      </header>

      <label className="block space-y-1">
        <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Kérdés minden cégre
        </span>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={running}
          className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm outline-none focus:border-blue-500 disabled:opacity-60"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MultiCombobox
          label="Forrás"
          values={sources}
          onChange={setSources}
          unit="forrás"
          placeholder="Minden forrás"
          options={Object.keys(SOURCE_LABELS)
            .sort()
            .map((value) => ({
              value,
              label: sourceLabel(value),
              keywords: value.replace(/[-_]/g, " "),
            }))}
        />
        <Combobox
          label="Ország"
          value={country}
          onChange={setCountry}
          emptyLabel="Minden ország"
          placeholder="Minden ország"
          options={Object.keys(COUNTRIES).map((code) => ({
            value: code,
            label: countryLabel(code),
          }))}
        />
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Típus
          </span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
          >
            <option value="">Minden típus</option>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Lead, ha legalább
          </span>
          <input
            type="number"
            min={0.05}
            max={1}
            step={0.05}
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Egyszerre (1–8)
          </span>
          <input
            type="number"
            min={1}
            max={8}
            value={concurrency}
            onChange={(event) => setConcurrency(event.target.value)}
            className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <button
            type="button"
            onClick={() => act({ action: "stop" })}
            disabled={sweep?.status === "stopping"}
            className="h-9 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
          >
            Leállítás
          </button>
        ) : (
          <button
            type="button"
            disabled={!question.trim()}
            onClick={() =>
              act({
                action: "start",
                question: question.trim(),
                threshold: Number(threshold),
                concurrency: Number(concurrency),
                filters: { source: sources.join(","), country, kind },
              })
            }
            className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            Keresés indítása
          </button>
        )}
        {running && sweep?.active.length ? (
          <span className="text-xs text-[var(--muted)]">
            Most: {sweep.active.join(", ")}
          </span>
        ) : null}
      </div>

      {error || sweep?.message ? (
        <p
          className={`whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm ${
            error || sweep?.status === "error"
              ? "border-red-500/40 bg-red-500/10 text-red-200"
              : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]"
          }`}
        >
          {error || sweep?.message}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {[
          ["Értékelt (összes)", formatNumber(data?.total ?? 0)],
          ["Lead (összes)", formatNumber(data?.leads ?? 0)],
          [
            "Ebben a futásban",
            sameQuestion ? formatNumber(sweep?.processed ?? 0) : "—",
          ],
          ["Ebből lead", sameQuestion ? formatNumber(sweep?.leads ?? 0) : "—"],
          [
            "Kihagyva / hiba",
            sameQuestion
              ? `${sweep?.skipped ?? 0} / ${sweep?.failed ?? 0}`
              : "—",
          ],
          [
            "Költség (futás)",
            sameQuestion ? `$${(sweep?.costTotal ?? 0).toFixed(5)}` : "—",
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
          >
            <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {label}
            </div>
            <div className="text-lg tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          Eredmények erre a kérdésre{" "}
          <span className="text-[var(--muted)]">(legutóbbi 200)</span>
        </h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={leadsOnly}
            onChange={(event) => setLeadsOnly(event.target.checked)}
          />
          Csak leadek
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-2)] text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Idő</th>
              <th className="px-3 py-2">Cég</th>
              <th className="px-3 py-2">Ország</th>
              <th className="px-3 py-2">Forrás</th>
              <th className="px-3 py-2">Valószínűség</th>
              <th className="px-3 py-2">Idő (ms)</th>
              <th className="px-3 py-2">Költség</th>
              <th className="px-3 py-2">Token</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {!data?.items.length ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-6 text-center text-[var(--muted)]"
                >
                  {leadsOnly
                    ? "Még nincs lead erre a kérdésre."
                    : "Még nincs eredmény erre a kérdésre."}
                </td>
              </tr>
            ) : null}
            {data?.items.map((item) => (
              <Fragment key={item.companyKey}>
                <tr
                  className={`border-t border-[var(--border)] align-top ${
                    item.lead ? "bg-green-500/5" : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--muted)]">
                    {new Date(item.evaluatedAt).toLocaleTimeString("hu-HU")}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{item.company}</div>
                    {item.website ? (
                      <a
                        href={
                          item.website.startsWith("http")
                            ? item.website
                            : `https://${item.website}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-400 hover:underline"
                      >
                        {item.website}
                      </a>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {countryLabel(item.country)}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--muted)]">
                    {sourceLabel(item.source)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    <span
                      className={
                        item.lead ? "text-green-400" : "text-[var(--muted)]"
                      }
                    >
                      {item.probability.toFixed(2)}
                      {item.lead ? " · LEAD" : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{item.elapsedMs}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {item.cost == null ? "—" : `$${item.cost.toFixed(8)}`}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {item.inputTokens ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        setOpen(
                          open === item.companyKey ? null : item.companyKey,
                        )
                      }
                      className="text-xs text-blue-400 hover:underline"
                    >
                      {open === item.companyKey ? "Bezár" : "Mit kapott"}
                    </button>
                  </td>
                </tr>
                {open === item.companyKey ? (
                  <tr className="border-t border-[var(--border)] bg-[var(--surface-2)]">
                    <td colSpan={9} className="px-3 py-2 text-xs">
                      <div className="mb-1 text-[var(--muted)]">
                        Állapot, amit a modell kapott:
                      </div>
                      <p className="whitespace-pre-wrap">{item.state}</p>
                      <div className="mt-1 text-[var(--muted)]">
                        Küszöb: {item.threshold} · kontakt: {item.contactId}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
