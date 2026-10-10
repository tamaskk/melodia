"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import MailChart, { type DailyPoint } from "./MailChart";
import { formatNumber } from "@/lib/format";
import { useStatusPoll } from "./useStatusPoll";

interface MailAddress {
  name: string | null;
  address: string;
}

interface MailMessage {
  key: string;
  threadId: string;
  direction: "in" | "out";
  from: MailAddress;
  to: MailAddress[];
  subject: string;
  date: string;
  text: string;
  attachments: string[];
  bounce: boolean;
  auto: boolean;
}

type ThreadStatus =
  "nincs-valasz" | "valasz-var" | "valaszoltam" | "visszapattant";

interface MailThread {
  threadId: string;
  subject: string;
  counterpart: string;
  company: string | null;
  contactId: string | null;
  firstAt: string;
  lastAt: string;
  messages: number;
  incoming: number;
  outgoing: number;
  bounced: boolean;
  autoOnly: boolean;
  status: ThreadStatus;
  lastDirection: "in" | "out";
  preview: string;
}

interface Stats {
  threads: number;
  answered: number;
  waiting: number;
  bounced: number;
  silent: number;
  replyRate: number;
}

interface SyncStatus {
  status: "idle" | "running" | "done" | "error";
  phase: string | null;
  scanned: number;
  added: number;
  message: string | null;
  ready?: boolean;
  finishedAt?: string | null;
  autoEveryMinutes?: number;
}

const STATUS_LABELS: Record<ThreadStatus, string> = {
  "valasz-var": "válasz jött",
  valaszoltam: "válaszoltam",
  "nincs-valasz": "nincs válasz",
  visszapattant: "visszapattant",
};

const STATUS_STYLE: Record<ThreadStatus, string> = {
  "valasz-var": "border-emerald-500/60 bg-emerald-500/15 text-emerald-300",
  valaszoltam: "border-blue-500/60 bg-blue-500/15 text-blue-300",
  "nincs-valasz":
    "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]",
  visszapattant: "border-red-500/60 bg-red-500/15 text-red-300",
};

const FILTERS: { key: ThreadStatus | ""; label: string }[] = [
  { key: "", label: "mind" },
  { key: "valasz-var", label: "válasz jött" },
  { key: "valaszoltam", label: "válaszoltam" },
  { key: "nincs-valasz", label: "nincs válasz" },
  { key: "visszapattant", label: "visszapattant" },
];

function when(iso: string): string {
  const date = new Date(iso);
  const days = (Date.now() - date.getTime()) / 86_400_000;
  if (days < 1) {
    return date.toLocaleTimeString("hu", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (days < 320) {
    return date.toLocaleDateString("hu", { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString("hu");
}

function fullWhen(iso: string): string {
  return new Date(iso).toLocaleString("hu", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * A válaszlevelek alján ott lóg az egész előzmény ("2026. 08. 12. …írta:").
 * Ezt levágjuk, és külön nyitható — így a tényleges válasz látszik elöl.
 */
function splitQuote(text: string): { body: string; quoted: string } {
  const lines = text.split("\n");
  const marker = lines.findIndex(
    (line) =>
      /^\s*>/.test(line) ||
      /írta( ezt)?:\s*$/i.test(line) ||
      /^\s*-{2,}\s*(Original Message|Eredeti üzenet|Forwarded message)/i.test(
        line,
      ) ||
      /\bwrote:\s*$/i.test(line),
  );
  if (marker <= 0) return { body: text, quoted: "" };
  return {
    body: lines.slice(0, marker).join("\n").trimEnd(),
    quoted: lines.slice(marker).join("\n").trim(),
  };
}

function Bubble({ message }: { message: MailMessage }) {
  const mine = message.direction === "out";
  const { body, quoted } = splitQuote(message.text);
  const [showQuote, setShowQuote] = useState(false);

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] space-y-2 rounded-xl border p-3 ${
          mine
            ? "border-blue-500/40 bg-blue-500/10"
            : message.bounce
              ? "border-red-500/40 bg-red-500/10"
              : "border-[var(--border)] bg-[var(--surface-2)]"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
          <span className="font-medium text-foreground">
            {mine ? "Én" : (message.from.name ?? message.from.address)}
          </span>
          <span>{message.from.address}</span>
          <span>·</span>
          <span>{fullWhen(message.date)}</span>
          {message.auto ? (
            <span className="rounded-full bg-amber-500/15 px-2 text-amber-300">
              automatikus
            </span>
          ) : null}
          {message.bounce ? (
            <span className="rounded-full bg-red-500/15 px-2 text-red-300">
              visszapattant
            </span>
          ) : null}
        </div>

        <p className="text-xs font-medium">
          {message.subject || "(nincs tárgy)"}
        </p>

        <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed">
          {body || "(üres levél)"}
        </pre>

        {message.attachments.length ? (
          <p className="text-[11px] text-[var(--muted)]">
            📎 {message.attachments.join(", ")}
          </p>
        ) : null}

        {quoted ? (
          <div>
            <button
              type="button"
              onClick={() => setShowQuote((value) => !value)}
              className="inline-flex h-8 items-center rounded-lg border border-[var(--border)] px-2 text-[11px] text-[var(--muted)] transition hover:text-foreground"
            >
              {showQuote ? "előzmény elrejtése" : "előzmény mutatása"}
            </button>
            {showQuote ? (
              <pre className="mt-2 whitespace-pre-wrap break-words border-l-2 border-[var(--border)] pl-3 font-sans text-[12px] leading-relaxed text-[var(--muted)]">
                {quoted}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Levelező felület a megkeresésekhez: bal oldalt a szálak, jobb oldalt a
 * teljes levelezés. Csak az ide tartozó levelek látszanak — a postafiók
 * magánlevelezése be sem kerül az adatbázisba.
 *
 * `rejectedOnly`: ugyanez a felület, de csak az elutasító válaszok szálaival,
 * számok, diagram és állapotszűrő nélkül.
 */
export default function MailApp({
  rejectedOnly = false,
}: {
  rejectedOnly?: boolean;
}) {
  const [threads, setThreads] = useState<MailThread[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState<ThreadStatus | "">("");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(true);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (rejectedOnly) params.set("rejected", "1");
      if (query.trim()) params.set("q", query.trim());
      params.set("days", String(days));
      const response = await fetch(`/api/mail?${params}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Betöltési hiba");
      setThreads(data.threads as MailThread[]);
      setStats(data.stats as Stats);
      setDaily((data.daily ?? []) as DailyPoint[]);
      setReady(Boolean(data.ready));
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status, query, days, rejectedOnly]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  // Egy szál megnyitása: a leveleket külön kérjük le, hogy a lista könnyű maradjon.
  useEffect(() => {
    if (!openId) return;
    let alive = true;
    void (async () => {
      const response = await fetch(
        `/api/mail?threadId=${encodeURIComponent(openId)}`,
        {
          cache: "no-store",
        },
      );
      const data = await response.json();
      if (alive && response.ok) setMessages(data.messages as MailMessage[]);
    })();
    return () => {
      alive = false;
    };
  }, [openId]);

  // Begyűjtés közben figyeljük az állapotot, aztán egyszer frissítjük a listát.
  // Az automatikus szinkron a háttérben is elindulhat — betöltéskor és
  // tabváltáskor rákérdezünk, futás közben sűrűn.
  const syncing = sync?.status === "running";
  const wasRunning = useRef(false);
  const refreshSync = useCallback(async () => {
    try {
      const response = await fetch("/api/mail/sync", { cache: "no-store" });
      if (response.ok) setSync((await response.json()) as SyncStatus);
    } catch {
      // a következő kör újrapróbálja
    }
  }, []);
  useStatusPoll(refreshSync, syncing, 1500);
  useEffect(() => {
    if (syncing) wasRunning.current = true;
  }, [syncing]);

  useEffect(() => {
    if (wasRunning.current && sync && sync.status !== "running") {
      wasRunning.current = false;
      void load();
    }
  }, [sync, load]);

  const startSync = async () => {
    setError(null);
    try {
      const response = await fetch("/api/mail/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hiba");
      setSync(data as SyncStatus);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const open = threads.find((thread) => thread.threadId === openId) ?? null;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1500px] flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {rejectedOnly ? "Elutasítások" : "Levelezés"}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {rejectedOnly
              ? "Akik válaszoltak, de elutasítottak — a teljes levelezéssel."
              : "A kiküldött jelentkezések, a rájuk érkezett válaszok és a saját válaszaim — csak ezek, a postafiók többi levele nélkül."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void startSync()}
            disabled={syncing || !ready}
            className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
            title="Új levelek behúzása a Gmailből (csak olvasunk)"
          >
            {syncing ? "Begyűjtés…" : "Frissítés a Gmailből"}
          </button>
          <span className="text-xs text-[var(--muted)]">
            {sync?.finishedAt
              ? `utolsó: ${new Date(sync.finishedAt).toLocaleString("hu-HU", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "ebben a munkamenetben még nem futott"}
            {sync?.autoEveryMinutes
              ? ` · magától ${sync.autoEveryMinutes} percenként`
              : ""}
          </span>
        </div>
      </header>

      {!ready ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Nincs Gmail-hozzáférés. Az <code>atlas-credentials.env</code>-be kell
          a <code>GMAIL_USER</code> és a <code>GMAIL_APP_PASSWORD</code> —
          ugyanaz, amivel a kiküldés megy.
        </p>
      ) : null}

      {sync && sync.status !== "idle" ? (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            sync.status === "error"
              ? "border-red-500/40 bg-red-500/10 text-red-200"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
          }`}
        >
          {syncing
            ? `${sync.phase ?? "begyűjtés"} — ${sync.scanned} levél átnézve`
            : (sync.message ?? "Kész.")}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {stats && !rejectedOnly ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["Megkeresés", formatNumber(stats.threads), ""],
            ["Válasz jött", formatNumber(stats.answered), "text-emerald-300"],
            ["Rám vár", formatNumber(stats.waiting), "text-amber-300"],
            ["Visszapattant", formatNumber(stats.bounced), "text-red-300"],
            ["Válaszarány", `${stats.replyRate}%`, "text-blue-300"],
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
      ) : null}

      {daily.length && !rejectedOnly ? (
        <MailChart data={daily} days={days} onDaysChange={setDays} />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Keresés: cég, cím, tárgy…"
          className="h-9 min-w-[240px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm outline-none focus:border-blue-500"
        />
        {(rejectedOnly ? [] : FILTERS).map((filter) => (
          <button
            key={filter.key || "mind"}
            type="button"
            onClick={() => setStatus(filter.key)}
            className={`h-9 rounded-lg border px-3 text-xs transition ${
              status === filter.key
                ? "border-blue-500 bg-blue-500/15 text-blue-200"
                : "border-[var(--border)] text-[var(--muted)] hover:border-blue-500"
            }`}
          >
            {filter.label}
          </button>
        ))}
        {rejectedOnly ? (
          <span className="text-xs text-[var(--muted)]">
            {formatNumber(threads.length)} elutasítás
          </span>
        ) : null}
        {loading ? (
          <span className="text-xs text-[var(--muted)]">frissítés…</span>
        ) : null}
      </div>

      {/* A lista és a részlet együtt egy képernyőnyi magas, mindkettő saját
          görgetéssel — így a sok szál nem nyújtja meg az oldalt, és a kiválasztott
          szál mindig a lista mellett marad. (53px = a felső menüsáv.) */}
      <div className="grid grid-cols-1 gap-3 lg:h-[calc(100dvh-53px-2rem)] lg:grid-cols-[minmax(320px,420px)_1fr]">
        <div className="max-h-[70dvh] min-h-0 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] lg:max-h-none">
          {threads.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted)]">
              {loading
                ? "Töltés…"
                : rejectedOnly
                  ? "Nincs elutasító válasz. Ide az kerül, akinél a kimenetel „Elutasítva”, vagy a válaszát az osztályozó elutasításnak ítélte."
                  : ready
                    ? "Még nincs behúzott levél. Nyomd meg a „Frissítés a Gmailből” gombot."
                    : "Állítsd be a Gmail-hozzáférést, utána tudok leveleket behúzni."}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {threads.map((thread) => (
                <li key={thread.threadId}>
                  <button
                    type="button"
                    onClick={() => {
                      setMessages([]);
                      setOpenId(thread.threadId);
                    }}
                    className={`w-full space-y-1 px-3 py-2.5 text-left transition hover:bg-[var(--surface-2)] ${
                      openId === thread.threadId ? "bg-[var(--surface-2)]" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {thread.company ?? thread.counterpart}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--muted)]">
                        {when(thread.lastAt)}
                      </span>
                    </div>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {thread.subject}
                    </p>
                    <p className="truncate text-[11px] text-[var(--muted)]">
                      {thread.lastDirection === "out" ? "Én: " : ""}
                      {thread.preview}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLE[thread.status]}`}
                      >
                        {STATUS_LABELS[thread.status]}
                      </span>
                      <span className="text-[11px] text-[var(--muted)]">
                        {thread.messages} levél
                      </span>
                      {thread.autoOnly ? (
                        <span className="text-[11px] text-amber-300">
                          csak automatikus
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-h-0 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          {!open ? (
            <p className="text-sm text-[var(--muted)]">
              Válassz egy szálat a bal oldali listából.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-2">
                <h2 className="text-sm font-semibold">
                  {open.company ?? open.counterpart}
                </h2>
                <span className="text-xs text-[var(--muted)]">
                  {open.counterpart}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLE[open.status]}`}
                >
                  {STATUS_LABELS[open.status]}
                </span>
                {open.contactId ? (
                  <Link
                    href={`/?q=${encodeURIComponent(open.company ?? open.counterpart)}`}
                    className="ml-auto rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] transition hover:border-blue-500"
                  >
                    Cég a listában
                  </Link>
                ) : null}
              </div>

              {messages.map((message) => (
                <Bubble key={message.key} message={message} />
              ))}

              {messages.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  Levelek betöltése…
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
