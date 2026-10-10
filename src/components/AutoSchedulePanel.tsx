"use client";

import { useCallback, useEffect, useState } from "react";
import type { AutoPlan, AutoQueue } from "@/lib/autoSchedule";
import { fileSize, formatNumber } from "@/lib/format";
import { languageLabel, languageMismatch } from "@/lib/mailLanguage";
import { button, field } from "./ui";

interface Account {
  id: string;
  label: string;
  provider: "gmail" | "resend";
}

interface Attachment {
  key: string;
  name: string;
  bytes: number;
  scope: string;
}

interface Lead {
  id: string;
  company: string;
  email: string | null;
  country: string | null;
  language: string | null;
  subject: string;
}

const LABEL = "block text-[11px] uppercase tracking-wider text-[var(--muted)]";

/** „október 12., hétfő" — a naptári nap, időzóna-csúszás nélkül. */
const longDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("hu-HU", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

/** Miért ennyi fér egy fiókra egy napon — egy mondatban. */
function limitNote(queue: AutoQueue): string {
  const { cap, by, taken } = queue.limit;
  const why = {
    warmup: `felfuttatás: aznap legfeljebb ${cap}`,
    max: `a fiók saját napi maximuma ${cap}`,
    time: `a szünetekkel naponta legfeljebb ~${cap} fér ki`,
    today: `a mai nap hátralévő részébe ${cap} fér`,
    limit: `napi keret ${cap}`,
  }[by];
  return taken ? `${why}, ebből ${taken} már foglalt` : why;
}

/**
 * Automatikus ütemezés: a szűrt (vagy kijelölt) címzetteket napokra és
 * fiókokra osztja, előnézetet mutat, és elfogadás után létrehozza a queue-kat.
 */
export default function AutoSchedulePanel({
  filters,
  selectedIds,
  onCreated,
}: {
  filters: Record<string, string>;
  selectedIds: string[];
  /** Létrehozás után a szülő frissíti a listát. */
  onCreated: () => void;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  // Amit kivettél: fiókok és csatolmányok. Alapból minden megy.
  const [offAccounts, setOffAccounts] = useState<string[]>([]);
  const [offFiles, setOffFiles] = useState<string[]>([]);
  const [mode, setMode] = useState<"all" | "range">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [weekends, setWeekends] = useState(false);
  const [minMinutes, setMinMinutes] = useState(10);
  const [maxMinutes, setMaxMinutes] = useState(20);
  const [prefix, setPrefix] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [plan, setPlan] = useState<AutoPlan | null>(null);
  // Az előnézetben lenyitott queue címzettjei (kulcs: nap + fiók).
  const [leads, setLeads] = useState<Record<string, Lead[]>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/queues/auto", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setAccounts(data.accounts as Account[]);
      setFiles((data.attachments?.files ?? []) as Attachment[]);
    } catch {
      // A választók nélkül a panel nem használható — a mentés úgyis szól.
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const picked = files.filter((file) => !offFiles.includes(file.key));

  /** A beállítások, ahogy a szerver várja. */
  const settings = () => ({
    ...(selectedIds.length ? { ids: selectedIds } : { filters }),
    mode,
    from,
    ...(mode === "range" ? { to } : {}),
    weekends,
    accountIds: accounts
      .filter((account) => !offAccounts.includes(account.id))
      .map((account) => account.id),
    minMinutes,
    maxMinutes,
    // Érintetlenül nem küldünk listát: az „minden csatolmány"-t jelent.
    ...(offFiles.length ? { attachments: picked.map((file) => file.key) } : {}),
    prefix,
  });

  const post = async (action: string, body: Record<string, unknown>) => {
    const response = await fetch("/api/queues/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Hiba");
    return data;
  };

  const preview = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      setPlan((await post("preview", settings())) as AutoPlan);
      setLeads({});
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const done = await post("apply", settings());
      setPlan(null);
      setNote(
        `Létrejött ${formatNumber(done.created)} queue, bennük ${formatNumber(done.placed)} címzett` +
          (done.lastDay ? ` — az utolsó nap ${longDay(done.lastDay)}.` : ".") +
          (done.leftover
            ? ` ${formatNumber(done.leftover)} címzett kimaradt.`
            : ""),
      );
      onCreated();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Egy tervezett queue címzettjei — csak akkor kérjük le, ha lenyitod. */
  const showLeads = async (key: string, queue: AutoQueue) => {
    if (leads[key]) return;
    try {
      const data = await post("leads", { ids: queue.contactIds.slice(0, 200) });
      setLeads((current) => ({ ...current, [key]: data.leads as Lead[] }));
    } catch {
      setLeads((current) => ({ ...current, [key]: [] }));
    }
  };

  const scope = selectedIds.length
    ? `${formatNumber(selectedIds.length)} kijelölt sor`
    : "a szűrt lista";
  const planned = plan
    ? plan.days.flatMap((day) => day.queues).filter((queue) => queue.count)
    : [];

  return (
    <details className="group mx-3 mb-3 rounded-xl border border-[var(--border)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span>
          Automatikus ütemezés{" "}
          <span className="ml-1 font-normal text-[var(--muted)]">
            {scope} szétosztása queue-kba, napokra és fiókokra
          </span>
        </span>
        <span className="text-xs text-[var(--muted)] transition group-open:rotate-180">
          ▼
        </span>
      </summary>

      <form
        onSubmit={preview}
        className="space-y-3 border-t border-[var(--border)] p-3"
      >
        <p className="max-w-4xl text-xs text-[var(--muted)]">
          Bekerül: {scope} — akinek van címe, még nem kapott levelet, és nincs
          queue-ban, cégnév szerint. Minden napra minden fiók külön queue-t kap,
          a fiók aznapi szabad keretéig; a felfuttatás későbbi, magasabb
          kereteivel és a már betervezett queue-kkal együtt számol. A lehető
          leghamarabb tölt, nem osztja el egyenletesen.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <span className={LABEL}>Mód</span>
            <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
              {(
                [
                  ["all", "Összes kiválasztott"],
                  ["range", "Egyéni időszak"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                  className={`h-8 px-3 text-xs transition ${
                    mode === value
                      ? "bg-blue-600 text-white"
                      : "text-[var(--muted)] hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="space-y-1">
            <span className={LABEL}>
              {mode === "range" ? "Első nap" : "Kezdés"}
            </span>
            <input
              type="date"
              value={from}
              required={mode === "range"}
              onChange={(event) => setFrom(event.target.value)}
              title="Üresen: holnap"
              className={`${field("sm")} w-40`}
            />
          </label>
          {mode === "range" ? (
            <label className="space-y-1">
              <span className={LABEL}>Utolsó nap</span>
              <input
                type="date"
                value={to}
                required
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
                className={`${field("sm")} w-40`}
              />
            </label>
          ) : null}
          <label className="flex h-8 items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={weekends}
              onChange={(event) => setWeekends(event.target.checked)}
              className="size-4 accent-emerald-500"
            />
            Hétvégén is
          </label>
          <label className="space-y-1">
            <span className={LABEL}>Szünet (perc)</span>
            <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
              <input
                type="number"
                min={1}
                max={120}
                value={minMinutes}
                onChange={(event) => setMinMinutes(Number(event.target.value))}
                aria-label="Legrövidebb szünet"
                className={`${field("sm")} w-16`}
              />
              –
              <input
                type="number"
                min={1}
                max={240}
                value={maxMinutes}
                onChange={(event) => setMaxMinutes(Number(event.target.value))}
                aria-label="Leghosszabb szünet"
                className={`${field("sm")} w-16`}
              />
            </span>
          </label>
          <label className="min-w-0 flex-1 space-y-1">
            <span className={LABEL}>Név előtagja</span>
            <input
              value={prefix}
              required
              maxLength={40}
              onChange={(event) => setPrefix(event.target.value)}
              placeholder="pl. HU-IT"
              title="A queue-k neve: előtag · nap · fiók"
              className={`${field("sm")} w-full min-w-40`}
            />
          </label>
        </div>

        <fieldset className="space-y-1.5">
          <legend className={LABEL}>Fiókok</legend>
          <div className="flex flex-wrap gap-2">
            {accounts.map((account) => {
              const on = !offAccounts.includes(account.id);
              return (
                <label
                  key={account.id}
                  className={`flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                    on
                      ? "border-emerald-500 text-emerald-200"
                      : "border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setOffAccounts((current) =>
                        on
                          ? [...current, account.id]
                          : current.filter((id) => id !== account.id),
                      )
                    }
                    className="size-4 shrink-0 accent-emerald-500"
                  />
                  <span className="min-w-0 break-all">
                    {account.label}
                    {account.provider === "resend" ? " · Resend" : ""}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className={LABEL}>
            Csatolmányok — minden queue ezt kapja
          </legend>
          {files.length ? (
            <div className="flex flex-wrap gap-2">
              {files.map((file) => {
                const on = !offFiles.includes(file.key);
                return (
                  <label
                    key={file.key}
                    className={`flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                      on
                        ? "border-emerald-500 text-emerald-200"
                        : "border-[var(--border)] text-[var(--muted)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={on && picked.length === 1}
                      onChange={() =>
                        setOffFiles((current) =>
                          on
                            ? [...current, file.key]
                            : current.filter((key) => key !== file.key),
                        )
                      }
                      className="size-4 shrink-0 accent-emerald-500"
                    />
                    <span className="min-w-0 break-all">{file.name}</span>
                    <span className="shrink-0 whitespace-nowrap text-[11px] text-[var(--muted)]">
                      {fileSize(file.bytes)}
                      {file.scope === "közös" ? "" : ` · csak ${file.scope}`}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-amber-300">
              A küldő gép még nem tette közzé a csatolmányai listáját — így
              mentve a queue-k azt viszik, ami küldéskor a mappában van.
            </p>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className={button("primary", "md")}
          >
            {busy && !plan ? "Számolok…" : "Elhelyezés"}
          </button>
          <span className="text-xs text-[var(--muted)]">
            Előbb megmutatom, mi hova kerülne — queue csak elfogadás után jön
            létre.
          </span>
        </div>
        {error && !plan ? (
          <p role="alert" className="text-xs text-red-300">
            {error}
          </p>
        ) : null}
        {note ? (
          <p role="status" className="text-xs text-emerald-300">
            {note}
          </p>
        ) : null}
      </form>

      {plan ? (
        <div
          className="fixed inset-0 z-50 flex bg-black/60 p-2 sm:p-4"
          onClick={() => setPlan(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ütemezés előnézete"
            className="m-auto flex max-h-[92vh] w-full max-w-[900px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-1 border-b border-[var(--border)] p-4">
              <h2 className="text-lg font-semibold">Ütemezés előnézete</h2>
              <p className="text-sm text-[var(--muted)]">
                {formatNumber(plan.leads)} küldhető címzettből{" "}
                <span className="text-foreground">
                  {formatNumber(plan.placed)}
                </span>{" "}
                kerül {formatNumber(planned.length)} queue-ba
                {plan.lastDay
                  ? `, ${longDay(plan.days[0].day)} és ${longDay(plan.lastDay)} között`
                  : ""}
                .
              </p>
              {plan.leftover ? (
                <p className="text-sm text-amber-300">
                  {formatNumber(plan.leftover)} címzett kimarad:{" "}
                  {plan.mode === "range"
                    ? "a megadott időszakba ennyi nem fér bele."
                    : "a tervezhető napokon nincs több hely."}
                </p>
              ) : null}
              {plan.mismatched ? (
                <p className="text-sm text-amber-300">
                  {formatNumber(plan.mismatched)} címzettnél a levél nyelve nem
                  illik a cég országához (pl. magyar cég angol levelet kapna).
                  Lenyitva a sorokat sárgával jelölve látod őket — elfogadás
                  előtt érdemes rendbe tenni.
                </p>
              ) : null}
              {plan.capped ? (
                <p className="text-sm text-amber-300">
                  A szűrésben ennél több címzett van — egy futtatás legfeljebb{" "}
                  {formatNumber(plan.leads)} címzettel számol.
                </p>
              ) : null}
              {!plan.placed ? (
                <p className="text-sm text-amber-300">
                  Nincs mit elhelyezni: nincs küldhető címzett, vagy a megadott
                  napokon minden fiók tele van.
                </p>
              ) : null}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {plan.days.map(({ day, queues }) => (
                <div key={day} className="space-y-1.5">
                  <h3 className="text-sm font-semibold">
                    {longDay(day)}{" "}
                    <span className="ml-1 text-xs font-normal text-[var(--muted)]">
                      {formatNumber(
                        queues.reduce((sum, queue) => sum + queue.count, 0),
                      )}{" "}
                      címzett
                    </span>
                  </h3>
                  {queues.map((queue) => {
                    const key = `${day}:${queue.accountId}`;
                    const room = queue.limit.cap - queue.limit.taken;
                    // A sor okot ír, ha a fiók aznap nem a teljes keretét kapta.
                    const short = queue.count < queue.limit.cap;
                    const head = (
                      <>
                        <span className="min-w-0 break-all font-medium">
                          {queue.label}
                          {queue.provider === "resend" ? " · Resend" : ""}
                        </span>
                        <span className="ml-auto whitespace-nowrap font-mono text-xs">
                          {queue.count} címzett
                        </span>
                        <span
                          className={`w-full text-xs ${short ? "text-amber-300" : "text-[var(--muted)]"}`}
                        >
                          {queue.count
                            ? queue.count < room
                              ? `Csak ${queue.count}: elfogytak a címzettek (${limitNote(queue)}).`
                              : limitNote(queue).replace(/^./, (c) =>
                                  c.toUpperCase(),
                                ) + "."
                            : `Ide nem kerül: aznap nincs szabad hely (${limitNote(queue)}).`}
                        </span>
                      </>
                    );
                    return queue.count ? (
                      <details
                        key={key}
                        onToggle={(event) => {
                          if (event.currentTarget.open) {
                            void showLeads(key, queue);
                          }
                        }}
                        className="rounded-lg border border-[var(--border)]"
                      >
                        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                          {head}
                        </summary>
                        <div className="border-t border-[var(--border)] px-3 py-2 text-xs">
                          <p className="mb-1 text-[var(--muted)]">
                            Queue neve: {queue.name}
                          </p>
                          {leads[key] ? (
                            <ol className="list-decimal space-y-0.5 pl-6">
                              {leads[key].map((lead) => {
                                const wrong = languageMismatch(
                                  lead.country,
                                  lead.language,
                                );
                                return (
                                  <li key={lead.id} className="break-all">
                                    {lead.company}{" "}
                                    <span className="text-[var(--muted)]">
                                      {lead.email}
                                    </span>
                                    <span
                                      className={`block ${wrong ? "text-amber-300" : "text-[var(--muted)]"}`}
                                    >
                                      {languageLabel(lead.language)} levél
                                      {wrong ? ` — ${wrong}` : ""}:{" "}
                                      {lead.subject || "(nincs tárgy)"}
                                    </span>
                                  </li>
                                );
                              })}
                            </ol>
                          ) : (
                            <p className="text-[var(--muted)]">Betöltés…</p>
                          )}
                          {queue.count > 200 ? (
                            <p className="mt-1 text-[var(--muted)]">
                              …és még {queue.count - 200} címzett.
                            </p>
                          ) : null}
                        </div>
                      </details>
                    ) : (
                      <div
                        key={key}
                        className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]"
                      >
                        {head}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] p-3">
              {error ? (
                <p role="alert" className="mr-auto text-xs text-red-300">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setPlan(null)}
                className={button("ghost", "md")}
              >
                Mégse
              </button>
              <button
                type="button"
                disabled={busy || !plan.placed}
                onClick={() => void accept()}
                className={button("primary", "md")}
              >
                {busy
                  ? "Létrehozás…"
                  : `Elfogadás — ${formatNumber(planned.length)} queue létrehozása`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </details>
  );
}
