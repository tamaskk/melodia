"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";
import type { QueueInfo, QueueOverview } from "@/lib/sendQueues";
import { button } from "./ui";

/** Ennyi időnként magától frissül — futó küldésnél így követhető. */
const REFRESH_MS = 30_000;

const WEEKDAYS = ["V", "H", "K", "Sze", "Cs", "P", "Szo"];

/** A nap dele UTC-ben: a naptári nap és a hét napja biztosan stimmel. */
const noon = (day: string) => new Date(`${day}T12:00:00Z`);

function dayLabel(day: string): {
  date: string;
  weekday: string;
  weekend: boolean;
} {
  const date = noon(day);
  const weekday = date.getUTCDay();
  return {
    date: `${date.getUTCMonth() + 1}. ${date.getUTCDate()}.`,
    weekday: WEEKDAYS[weekday],
    weekend: weekday === 0 || weekday === 6,
  };
}

const STATUS: Record<QueueInfo["status"], { label: string; tone: string }> = {
  varakozik: {
    label: "várakozik",
    tone: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  },
  fut: {
    label: "fut",
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  kesz: { label: "kész", tone: "border-[var(--border)] text-[var(--muted)]" },
  leallitva: {
    label: "leállítva",
    tone: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
};

export default function QueuesPanel() {
  const [data, setData] = useState<QueueOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Elavult válasz ne írja felül a frisset.
  const requestRef = useRef(0);
  const todayRef = useRef<HTMLTableCellElement>(null);
  const scrolledRef = useRef(false);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const response = await fetch("/api/queues", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Betöltési hiba");
      if (request === requestRef.current) setData(body as QueueOverview);
    } catch (caught) {
      if (request === requestRef.current) setError((caught as Error).message);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const act = async (
    method: "POST" | "DELETE",
    body: Record<string, unknown>,
  ) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/queues", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Hiba");
      setMessage(
        typeof result.message === "string"
          ? result.message
          : typeof result.stopped === "number"
            ? `Leállítás kérve ${result.stopped} fióknál — a folyamatban lévő levél még kimegy.`
            : "Kész.",
      );
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = (queue: QueueInfo) => {
    if (
      !window.confirm(
        `Törlöd a(z) „${queue.name}" queue-t? A címzettek megmaradnak; ha épp küld, a küldés leáll.`,
      )
    ) {
      return;
    }
    void act("DELETE", { id: queue.id });
  };

  // Keskeny képernyőn a naptár vízszintesen görög: első betöltéskor a mai
  // naphoz ugrunk, különben a múlt hét látszana. Utána nem nyúlunk hozzá, hogy
  // a fél percenkénti frissítés ne rántsa vissza.
  const loaded = Boolean(data);
  useEffect(() => {
    if (!loaded || scrolledRef.current) return;
    scrolledRef.current = true;
    todayRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [loaded]);

  const queues = data?.queues ?? [];
  const calendar = data?.calendar;
  const totals = calendar
    ? calendar.days.map((_, index) =>
        calendar.rows.reduce(
          (sum, row) => ({
            sent: sum.sent + row.cells[index].sent,
            planned: sum.planned + row.cells[index].planned,
          }),
          { sent: 0, planned: 0 },
        ),
      )
    : [];

  const cell = (
    value: { sent: number; planned: number },
    day: string,
    strong = false,
  ) => {
    const { weekend } = dayLabel(day);
    const isToday = day === calendar?.today;
    const past = calendar ? day < calendar.today : false;
    return (
      <td
        key={day}
        className={`px-1.5 py-1.5 text-center text-xs tabular-nums ${
          isToday ? "bg-blue-500/10" : weekend ? "bg-[var(--surface-2)]/60" : ""
        } ${strong ? "font-medium" : ""}`}
      >
        {value.sent ? <span>{value.sent}</span> : null}
        {!past && value.planned ? (
          <span className="text-[var(--muted)]">
            {value.sent ? " +" : ""}
            {value.planned}
          </span>
        ) : null}
        {!value.sent && (past || !value.planned) ? (
          <span className="text-[var(--border)]">·</span>
        ) : null}
      </td>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold">Queue-k és naptár</h1>
        <p className="max-w-3xl text-sm text-[var(--muted)]">
          Előre összeállított kiküldési sorok a hozzájuk kötött fiókokkal. Új
          queue a{" "}
          <Link href="/" className="text-blue-300 hover:underline">
            Kontaktok
          </Link>{" "}
          oldalon, a kiküldő sávban menthető a kijelölésből vagy a szűrt
          listából.
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300"
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300"
        >
          {message}
        </p>
      ) : null}

      <section className="space-y-3">
        {queues.map((queue) => {
          const state = STATUS[queue.status];
          return (
            <div
              key={queue.id}
              className="rounded-lg border border-[var(--border)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    {queue.name}
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-normal ${state.tone}`}
                    >
                      {state.label}
                    </span>
                  </h2>
                  <p className="text-sm text-[var(--muted)]">
                    {formatNumber(queue.remaining)} vár ·{" "}
                    {formatNumber(queue.sent)} kiment ·{" "}
                    {formatNumber(queue.total)} összesen · szünet{" "}
                    {queue.minMinutes}–{queue.maxMinutes} perc · futás napja:{" "}
                    {dayLabel(queue.runDate).date}
                    {queue.finishDay
                      ? ` · várható vége: ${dayLabel(queue.finishDay).date}`
                      : ""}
                  </p>
                  <p className="break-all text-xs text-[var(--muted)]">
                    Csatolmány:{" "}
                    {queue.attachments
                      ? queue.attachments.join(", ")
                      : "minden, ami küldéskor a küldő gép mappájában van"}
                  </p>
                  {queue.status === "varakozik" ? (
                    <p className="text-xs text-[var(--muted)]">
                      A lokális szerver indítja el, 7 és 19 óra között, a futás
                      napján vagy utána — 10 percenként ellenőriz.
                    </p>
                  ) : null}
                  {queue.note ? (
                    <p className="text-xs text-amber-300">{queue.note}</p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  {queue.status === "varakozik" || queue.status === "fut" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act("POST", { action: "stop", id: queue.id })
                      }
                      className="h-8 rounded-lg border border-red-500/60 px-3 text-xs text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
                    >
                      Leállítás
                    </button>
                  ) : null}
                  {queue.status === "leallitva" ? (
                    <button
                      type="button"
                      disabled={busy || !queue.remaining}
                      onClick={() =>
                        void act("POST", { action: "requeue", id: queue.id })
                      }
                      className={button("primary")}
                    >
                      Vissza a sorba
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(queue)}
                    className={button("ghost")}
                  >
                    Törlés
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {queue.accounts.map((account) => (
                  <span
                    key={account.accountId}
                    title={account.accountId}
                    className={`rounded-lg border px-2.5 py-1 text-xs ${
                      account.running
                        ? "border-emerald-500/60 text-emerald-200"
                        : "border-[var(--border)] text-[var(--muted)]"
                    }`}
                  >
                    {account.label}
                    {account.provider === "resend" ? " · Resend" : ""} · napi{" "}
                    {account.dailyLimit}
                    {account.missing ? " · törölt fiók" : ""}
                    {account.busy ? " · mással foglalt" : ""}
                  </span>
                ))}
              </div>

              {queue.accounts.some(
                (account) => account.dailyLimit > queue.perDayByTime,
              ) ? (
                <p className="mt-2 text-xs text-amber-300">
                  {queue.minMinutes}–{queue.maxMinutes} perces szünettel a 9–17
                  órás ablakba fiókonként legfeljebb ~{queue.perDayByTime} levél
                  fér egy nap — a nagyobb napi keret ettől nem telik be.
                </p>
              ) : null}
            </div>
          );
        })}
        {data && !queues.length ? (
          <p className="rounded-lg border border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
            Még nincs queue.
          </p>
        ) : null}
      </section>

      {calendar ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Naptár</h2>
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] text-[var(--muted)]">
                  <th className="sticky left-0 bg-[var(--background)] px-3 py-2 text-left font-medium uppercase tracking-wider max-sm:px-2">
                    Fiók
                  </th>
                  {calendar.days.map((day) => {
                    const label = dayLabel(day);
                    return (
                      <th
                        key={day}
                        ref={day === calendar.today ? todayRef : undefined}
                        className={`px-1.5 py-1.5 text-center font-normal ${
                          day === calendar.today
                            ? "bg-blue-500/10 text-foreground"
                            : label.weekend
                              ? "bg-[var(--surface-2)]/60"
                              : ""
                        }`}
                      >
                        <span className="block">{label.weekday}</span>
                        <span className="block whitespace-nowrap">
                          {label.date}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {calendar.rows.map((row) => (
                  <tr
                    key={row.accountId}
                    className="border-b border-[var(--border)]"
                  >
                    <td
                      title={row.accountId}
                      className="sticky left-0 whitespace-nowrap bg-[var(--background)] px-3 py-1.5 max-sm:max-w-28 max-sm:truncate max-sm:px-2 max-sm:text-xs"
                    >
                      {row.label}
                      <span className="ml-1.5 text-[11px] text-[var(--muted)] max-sm:hidden">
                        {row.provider === "resend" ? "Resend" : "Gmail"}
                      </span>
                    </td>
                    {row.cells.map((value, index) =>
                      cell(value, calendar.days[index]),
                    )}
                  </tr>
                ))}
                <tr>
                  <td className="sticky left-0 bg-[var(--background)] px-3 py-1.5 text-[11px] uppercase tracking-wider text-[var(--muted)] max-sm:px-2">
                    Összesen
                  </td>
                  {totals.map((value, index) =>
                    cell(value, calendar.days[index], true),
                  )}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="max-w-3xl text-xs text-[var(--muted)]">
            Fehér szám: ténylegesen kiment első levél. Halvány szám: előrejelzés
            a queue-k alapján — azt feltételezi, hogy minden queue fut, és a
            napi keretből, a felfuttatásból, a szünetekből és a hétvégékből
            számol. A kézzel (queue nélkül) indított küldést és a follow-upokat
            nem tartalmazza.
          </p>
        </section>
      ) : null}
    </div>
  );
}
