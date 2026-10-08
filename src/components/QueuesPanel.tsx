"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AttachmentList } from "@/lib/attachmentIndex";
import { fileSize, formatNumber } from "@/lib/format";
import type { QueueInfo, QueueOverview } from "@/lib/sendQueues";
import { STAGE_BY_VALUE, stageOf } from "@/lib/stage";
import type { ContactDoc } from "@/lib/types";
import { useMailMode } from "@/lib/useMailMode";
import {
  useSearchProvider,
  type SearchProviderChoice,
} from "@/lib/useSearchProvider";
import MessagePanel from "./MessagePanel";
import { button, field } from "./ui";

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

/** Ennyi címzett fér egy lapra a queue listájában. */
const MEMBERS_PAGE = 25;

/** Mit kap a kontakt panelje — ugyanaz, mint a Kontaktok oldalon. */
interface PanelOptions {
  aiEnabled?: boolean;
  emailSearchEnabled?: boolean;
  defaultProvider?: SearchProviderChoice;
}

/** Egy queue címzettjei: szöveges szűrő, lapozás, kattintásra a kontakt panelje. */
function QueueMembers({
  queueId,
  aiEnabled = false,
  emailSearchEnabled = false,
  defaultProvider = "openai",
}: PanelOptions & { queueId: string }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [contacts, setContacts] = useState<ContactDoc[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mailMode] = useMailMode();
  const [provider] = useSearchProvider(defaultProvider);
  // Elavult válasz ne írja felül a frisset.
  const requestRef = useRef(0);

  const load = useCallback(
    async (text: string, nextPage: number) => {
      const request = ++requestRef.current;
      const params = new URLSearchParams({
        queueId,
        sort: "company",
        page: String(nextPage),
        pageSize: String(MEMBERS_PAGE),
      });
      if (text.trim()) params.set("q", text.trim());
      try {
        const response = await fetch(`/api/contacts?${params}`, {
          cache: "no-store",
        });
        const body = await response.json();
        if (request !== requestRef.current) return;
        if (!response.ok) throw new Error(body.error ?? "Betöltési hiba");
        setContacts(body.contacts as ContactDoc[]);
        setTotal(typeof body.total === "number" ? body.total : 0);
        setPageCount(typeof body.pageCount === "number" ? body.pageCount : 1);
        setError(null);
      } catch (caught) {
        if (request === requestRef.current) setError((caught as Error).message);
      }
    },
    [queueId],
  );

  // Gépelés közben nem kérdezünk le minden betűnél.
  useEffect(() => {
    const timer = setTimeout(() => void load(q, page), 220);
    return () => clearTimeout(timer);
  }, [load, q, page]);

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      setContacts(
        (current) =>
          current?.map((contact) =>
            contact._id === id ? { ...contact, ...body } : contact,
          ) ?? current,
      );
      try {
        const response = await fetch(`/api/contacts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Mentési hiba");
        setContacts(
          (current) =>
            current?.map((contact) =>
              contact._id === id ? (data.contact as ContactDoc) : contact,
            ) ?? current,
        );
      } catch (caught) {
        setError((caught as Error).message);
        throw caught; // a panel így mutatja a sikertelen mentést
      }
    },
    [],
  );

  const closePanel = useCallback(() => setOpenId(null), []);
  const openContact =
    contacts?.find((contact) => contact._id === openId) ?? null;

  return (
    <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(event) => {
            setPage(0);
            setQ(event.target.value);
          }}
          placeholder="Szűrés: cég, név, e-mail, város…"
          aria-label="Címzettek szűrése"
          className={`${field("sm")} min-w-0 flex-1 sm:max-w-xs`}
        />
        <span className="text-xs tabular-nums text-[var(--muted)]">
          {contacts ? `${formatNumber(total)} címzett` : "betöltés…"}
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      ) : null}

      {contacts?.length ? (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {contacts.map((contact) => {
            const stage = STAGE_BY_VALUE[stageOf(contact)];
            return (
              <li key={contact._id}>
                <button
                  type="button"
                  onClick={() => setOpenId(contact._id)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-left text-sm transition hover:bg-[var(--surface-2)]"
                >
                  <span className="min-w-0 max-w-full truncate font-medium text-blue-400">
                    {contact.company}
                  </span>
                  {contact.person ? (
                    <span className="min-w-0 max-w-full truncate text-[var(--muted)]">
                      {contact.person}
                    </span>
                  ) : null}
                  <span className="min-w-0 max-w-full truncate font-mono text-xs text-[var(--muted)]">
                    {contact.primaryEmail ?? "nincs e-mail"}
                  </span>
                  <span
                    className={`ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${stage.tone}`}
                  >
                    {stage.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {contacts && !contacts.length ? (
        <p className="text-xs text-[var(--muted)]">
          {q.trim()
            ? "Nincs találat erre a szűrésre."
            : "Ebben a queue-ban nincs címzett."}
        </p>
      ) : null}

      {pageCount > 1 ? (
        <div className="flex items-center justify-end gap-2 text-xs">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            className={button("secondary")}
          >
            ← Előző
          </button>
          <span className="tabular-nums text-[var(--muted)]">
            {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((value) => value + 1)}
            className={button("secondary")}
          >
            Következő →
          </button>
        </div>
      ) : null}

      <MessagePanel
        contact={openContact}
        onClose={closePanel}
        onPatch={patch}
        aiEnabled={aiEnabled}
        emailSearchEnabled={emailSearchEnabled}
        provider={provider}
        mailMode={mailMode}
        onRestored={(restored) =>
          setContacts(
            (current) =>
              current?.map((item) =>
                item._id === restored._id ? restored : item,
              ) ?? current,
          )
        }
      />
    </div>
  );
}

/** A queue-k áttekintése a küldő gép csatolmány-jegyzékével együtt. */
type Overview = QueueOverview & { attachments?: AttachmentList };

/**
 * Mely fájlok mennek a queue leveleivel, név szerint: a kiválasztottak, vagy —
 * ha nincs külön választás — minden, ami a küldő gép mappájában van.
 */
function QueueFiles({
  keys,
  available,
}: {
  keys: string[] | null;
  available?: AttachmentList;
}) {
  const known = new Map(
    (available?.files ?? []).map((file) => [file.key, file]),
  );
  const files = keys
    ? keys.map((key) => ({ key, file: known.get(key) }))
    : (available?.files ?? []).map((file) => ({ key: file.key, file }));

  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-[var(--muted)]">
          Csatolmányok{keys ? "" : " (mind)"}:
        </span>
        {files.map(({ key, file }) => (
          <span
            key={key}
            title={
              !file
                ? "Nincs a küldő gép jegyzékében — lehet, hogy átnevezték vagy törölték."
                : file.scope === "közös"
                  ? "Minden levélre felkerül."
                  : `Csak a(z) ${file.scope} nyelvű levelekre kerül fel.`
            }
            className={`flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 ${
              file
                ? "border-[var(--border)]"
                : "border-amber-500/40 text-amber-300"
            }`}
          >
            <span className="min-w-0 break-all">{file?.name ?? key}</span>
            <span className="shrink-0 whitespace-nowrap text-[11px] text-[var(--muted)]">
              {file
                ? `${fileSize(file.bytes)}${file.scope === "közös" ? "" : ` · csak ${file.scope}`}`
                : "nincs a jegyzékben"}
            </span>
          </span>
        ))}
        {files.length === 0 ? (
          <span className="text-amber-300">
            {available?.remote
              ? "a küldő gép még nem tette közzé a mappája jegyzékét — a levelekkel az megy, ami küldéskor a mappában van"
              : "nincs fájl az attachments mappában — a levelek csatolmány nélkül mennek"}
          </span>
        ) : null}
      </div>
      {available?.remote && available.updatedAt ? (
        <p className="text-[11px] text-[var(--muted)]">
          A fájlok a küldő gépen vannak; a jegyzék frissült:{" "}
          {new Date(available.updatedAt).toLocaleString("hu-HU")}
        </p>
      ) : null}
    </div>
  );
}

export default function QueuesPanel(panelOptions: PanelOptions) {
  const [data, setData] = useState<Overview | null>(null);
  // Melyik queue címzettlistája van nyitva (egyszerre egy).
  const [membersOf, setMembersOf] = useState<string | null>(null);
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
      if (request === requestRef.current) setData(body as Overview);
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
                  </p>
                  {queue.overflow ? (
                    <p className="text-xs text-amber-300">
                      Ebből várhatóan {formatNumber(queue.overflow)} nem fér ki
                      a futás napján — ami nem megy ki, visszakerül a listába.
                    </p>
                  ) : null}
                  <QueueFiles
                    keys={queue.attachments}
                    available={data?.attachments}
                  />
                  {queue.status === "varakozik" ? (
                    <p className="text-xs text-[var(--muted)]">
                      A lokális szerver indítja el a futás napján, 7 és 19 óra
                      között. Ami aznap nem megy ki, visszakerül a listába.
                    </p>
                  ) : null}
                  {queue.note ? (
                    <p className="text-xs text-amber-300">{queue.note}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-expanded={membersOf === queue.id}
                    onClick={() =>
                      setMembersOf((current) =>
                        current === queue.id ? null : queue.id,
                      )
                    }
                    className={button("secondary")}
                  >
                    Címzettek ({formatNumber(queue.total)}){" "}
                    <span aria-hidden>
                      {membersOf === queue.id ? "▴" : "▾"}
                    </span>
                  </button>
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
                  {queue.minMinutes}–{queue.maxMinutes} perces szünettel a 7–19
                  órás ablakba fiókonként legfeljebb ~{queue.perDayByTime} levél
                  fér egy nap — a nagyobb napi keret ettől nem telik be.
                </p>
              ) : null}

              {membersOf === queue.id ? (
                <QueueMembers queueId={queue.id} {...panelOptions} />
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
