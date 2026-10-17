"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import MultiCombobox from "./MultiCombobox";
import { COUNTRIES, countryLabel } from "@/lib/countries";
import { formatNumber } from "@/lib/format";

interface FoundStartup {
  name: string;
  website: string;
  country: string | null;
  city: string | null;
  founded: number | null;
  employees: string | null;
  industry: string | null;
  description: string | null;
  funding: string | null;
  hiringSignal: string | null;
  sourceUrl: string | null;
}

interface WebResult {
  companyKey: string;
  company: string;
  website: string | null;
  country: string;
  state: string;
  probability: number;
  lead: boolean;
  threshold: number;
  cost: number | null;
  inputTokens: number | null;
  evaluatedAt: string;
  found?: FoundStartup;
  alreadyInDb?: boolean;
  imported?: boolean;
}

interface WebState {
  status: "idle" | "running" | "stopping" | "done" | "error";
  question: string;
  rounds: number;
  found: number;
  processed: number;
  leads: number;
  imported: number;
  skipped: number;
  failed: number;
  jevCost: number;
  searchTokens: number;
  currentAngle: string | null;
  message: string | null;
}

interface Payload {
  web: WebState;
  searchReady: boolean;
  items: WebResult[];
  total: number;
  leads: number;
}

const DEFAULT_QUESTION =
  "Is this company likely to hire a software developer for its own product or internal team (not for clients) in the next 6 months?";

const STATUS_LABEL: Record<WebState["status"], string> = {
  idle: "Áll",
  running: "Fut",
  stopping: "Leáll…",
  done: "Kész",
  error: "Hiba miatt megállt",
};

function href(url: string): string {
  return url.startsWith("http") ? url : `https://${url}`;
}

/**
 * Startupkeresés az interneten: körönként webkeresés hoz néhány startupot, a
 * Jev eldönti, lead-e, és a leadek (ha be van kapcsolva) a kontaktok közé
 * kerülnek.
 */
export default function JevWebPanel() {
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [focus, setFocus] = useState("B2B SaaS");
  const [countries, setCountries] = useState<string[]>([]);
  const [threshold, setThreshold] = useState("0.7");
  const [autoImport, setAutoImport] = useState(true);
  const [leadsOnly, setLeadsOnly] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    const params = new URLSearchParams({ question, limit: "200" });
    if (leadsOnly) params.set("leads", "1");
    try {
      const response = await fetch(`/api/jev/web?${params}`);
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
    data?.web.status === "running" || data?.web.status === "stopping";

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, running ? 2000 : 15000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load, running]);

  async function act(body: Record<string, unknown>) {
    setError("");
    const response = await fetch("/api/jev/web", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) setError(payload.error ?? `HTTP ${response.status}`);
    await load();
  }

  const web = data?.web;
  const sameQuestion = web?.question === question.trim();

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">
            Startupkeresés az interneten
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Körönként egy webkeresés (OpenAI) hoz kb. 10 startupot, a Jev
            eldönti, lead-e. Minden kör más szempontból keres, és a már látott
            cégeket kizárja — mindig új cég jön.
          </p>
        </div>
        {web ? (
          <span
            className={`rounded-full px-3 py-1 text-xs ${
              web.status === "running"
                ? "bg-green-500/15 text-green-300"
                : web.status === "error"
                  ? "bg-red-500/15 text-red-300"
                  : "bg-[var(--surface-2)] text-[var(--muted)]"
            }`}
          >
            {STATUS_LABEL[web.status]}
          </span>
        ) : null}
      </header>

      {data && !data.searchReady ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Nincs <code>OPENAI_API_KEY</code> az{" "}
          <code>atlas-credentials.env</code> fájlban — a webes kereséshez kell.
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Milyen startupokat keressen (fókusz)
          </span>
          <input
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
            disabled={running}
            placeholder="pl. B2B SaaS, fintech, healthtech, AI dev tools…"
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm outline-none focus:border-blue-500 disabled:opacity-60"
          />
        </label>
        <MultiCombobox
          label="Országok"
          values={countries}
          onChange={setCountries}
          unit="ország"
          placeholder="Bárhol (Európa + Észak-Amerika)"
          options={Object.keys(COUNTRIES)
            .filter((code) => code !== "INT")
            .map((code) => ({
              value: code,
              label: countryLabel(code),
              keywords: COUNTRIES[code].en,
            }))}
        />
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Kérdés minden talált cégre
        </span>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={running}
          className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm outline-none focus:border-blue-500 disabled:opacity-60"
        />
      </label>

      <div className="flex flex-wrap items-end gap-3">
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
            disabled={running}
            className="h-9 w-28 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
          />
        </label>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoImport}
            onChange={(event) => setAutoImport(event.target.checked)}
            disabled={running}
          />
          A leadek kerüljenek be a kontaktok közé
        </label>
        {running ? (
          <button
            type="button"
            onClick={() => act({ action: "stop" })}
            disabled={web?.status === "stopping"}
            className="ml-auto h-9 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
          >
            Leállítás
          </button>
        ) : (
          <button
            type="button"
            disabled={!question.trim() || data?.searchReady === false}
            onClick={() =>
              act({
                action: "start",
                question: question.trim(),
                focus: focus.trim(),
                countries,
                threshold: Number(threshold),
                autoImport,
              })
            }
            className="ml-auto h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            Startupkeresés indítása
          </button>
        )}
      </div>

      {running && web?.currentAngle ? (
        <p className="text-xs text-[var(--muted)]">
          {web.rounds}. kör — most ezt keresi: {web.currentAngle}
        </p>
      ) : null}

      {error || web?.message ? (
        <p
          className={`whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm ${
            error || web?.status === "error"
              ? "border-red-500/40 bg-red-500/10 text-red-200"
              : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]"
          }`}
        >
          {error || web?.message}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {[
          ["Értékelt (összes)", formatNumber(data?.total ?? 0)],
          ["Lead (összes)", formatNumber(data?.leads ?? 0)],
          [
            "Kör / talált",
            sameQuestion ? `${web?.rounds ?? 0} / ${web?.found ?? 0}` : "—",
          ],
          ["Ebből lead", sameQuestion ? formatNumber(web?.leads ?? 0) : "—"],
          ["Felvéve", sameQuestion ? formatNumber(web?.imported ?? 0) : "—"],
          [
            "Kihagyva / hiba",
            sameQuestion ? `${web?.skipped ?? 0} / ${web?.failed ?? 0}` : "—",
          ],
          [
            "Jev / keresés",
            sameQuestion
              ? `$${(web?.jevCost ?? 0).toFixed(5)} / ${formatNumber(web?.searchTokens ?? 0)} tok`
              : "—",
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
          >
            <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {label}
            </div>
            <div className="text-base tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          Talált startupok erre a kérdésre{" "}
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
              <th className="px-3 py-2">Startup</th>
              <th className="px-3 py-2">Ország</th>
              <th className="px-3 py-2">Finanszírozás</th>
              <th className="px-3 py-2">Felvételi jel</th>
              <th className="px-3 py-2">Valószínűség</th>
              <th className="px-3 py-2">Adatbázis</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {!data?.items.length ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-6 text-center text-[var(--muted)]"
                >
                  {leadsOnly
                    ? "Még nincs lead erre a kérdésre."
                    : "Még nincs talált startup erre a kérdésre."}
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
                  <td className="max-w-xs px-3 py-2">
                    <div className="font-medium">{item.company}</div>
                    {item.website ? (
                      <a
                        href={href(item.website)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-400 hover:underline"
                      >
                        {item.website}
                      </a>
                    ) : null}
                    {item.found?.description ? (
                      <div className="mt-0.5 text-xs text-[var(--muted)]">
                        {item.found.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {countryLabel(item.country)}
                    {item.found?.city ? (
                      <div className="text-xs text-[var(--muted)]">
                        {item.found.city}
                      </div>
                    ) : null}
                  </td>
                  <td className="max-w-[10rem] px-3 py-2 text-xs">
                    {item.found?.funding ?? "—"}
                  </td>
                  <td className="max-w-[12rem] px-3 py-2 text-xs">
                    {item.found?.hiringSignal ?? "—"}
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
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {item.imported ? (
                      <span className="text-green-400">felvéve</span>
                    ) : item.alreadyInDb ? (
                      <span className="text-[var(--muted)]">már bent volt</span>
                    ) : (
                      <span className="text-[var(--muted)]">
                        új, nem felvett
                      </span>
                    )}
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
                      {open === item.companyKey ? "Bezár" : "Részletek"}
                    </button>
                  </td>
                </tr>
                {open === item.companyKey ? (
                  <tr className="border-t border-[var(--border)] bg-[var(--surface-2)]">
                    <td colSpan={8} className="space-y-1 px-3 py-2 text-xs">
                      <div className="text-[var(--muted)]">
                        Amit a Jev kapott:
                      </div>
                      <p className="whitespace-pre-wrap">{item.state}</p>
                      <div className="text-[var(--muted)]">
                        Küszöb: {item.threshold} · Jev-költség:{" "}
                        {item.cost == null ? "—" : `$${item.cost.toFixed(8)}`} ·{" "}
                        {item.inputTokens ?? "—"} token
                        {item.found?.founded
                          ? ` · alapítva ${item.found.founded}`
                          : ""}
                        {item.found?.employees
                          ? ` · ${item.found.employees} fő`
                          : ""}
                      </div>
                      {item.found?.sourceUrl ? (
                        <a
                          href={href(item.found.sourceUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400 hover:underline"
                        >
                          Forrás: {item.found.sourceUrl}
                        </a>
                      ) : null}
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
