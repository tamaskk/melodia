"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatNumber } from "@/lib/format";
import { button, field } from "./ui";

interface Account {
  id: string;
  label: string;
  provider?: "gmail" | "resend";
}

interface Attachment {
  key: string;
  name: string;
  bytes: number;
  scope: string;
}

interface AttachmentFeed {
  files: Attachment[];
  /** A lista a küldő gép közzétett jegyzéke (telepített példányon). */
  remote: boolean;
}

function fileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`;
}

interface QueueName {
  id: string;
  name: string;
  total: number;
}

/** A fiók fajtájához illő alap napi keret. */
const defaultLimit = (account: Account) =>
  account.provider === "resend" ? 100 : 40;

/**
 * A kiküldő panel queue-sávja: mentés a kijelölésből vagy a szűrt listából,
 * és egy meglévő queue indítása — ilyenkor minden bekötött fiók elindul.
 */
export default function QueueBar({
  accounts,
  selectedIds,
  filters,
  onStarted,
}: {
  accounts: Account[];
  selectedIds: string[];
  filters: Record<string, string>;
  /** Indítás után a szülő frissíti a fiókok állapotát. */
  onStarted: () => void;
}) {
  const [queues, setQueues] = useState<QueueName[]>([]);
  const [chosen, setChosen] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  // Fiók → napi keret; ami nincs benne, az nincs bekötve.
  const [bound, setBound] = useState<Record<string, number>>({});
  // Üresen a mai nap: a szerver a feladó naptára szerint tölti ki.
  const [runDate, setRunDate] = useState("");
  const [files, setFiles] = useState<AttachmentFeed | null>(null);
  // `null` = nem nyúltál hozzá: minden megy, a később betett fájlok is.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [minMinutes, setMinMinutes] = useState(10);
  const [maxMinutes, setMaxMinutes] = useState(20);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/queues?brief=1", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json();
      setQueues(data.queues as QueueName[]);
      setFiles((data.attachments ?? null) as AttachmentFeed | null);
    } catch {
      // a sáv queue-lista nélkül is használható
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const response = await fetch("/api/queues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hiba");
      return data as Record<string, unknown>;
    } catch (caught) {
      setError((caught as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const data = await post({
      action: "create",
      name,
      ids: selectedIds,
      filters: selectedIds.length ? {} : filters,
      accounts: Object.entries(bound).map(([accountId, dailyLimit]) => ({
        accountId,
        dailyLimit,
      })),
      minMinutes,
      maxMinutes,
      runDate,
      // Érintetlenül nem küldünk listát: az "minden csatolmány"-t jelent.
      ...(picked ? { attachments: picked } : {}),
    });
    if (!data) return;
    setPicked(null);
    const skipped = Number(data.skipped ?? 0);
    setNote(
      `Mentve: „${name}" — ${formatNumber(Number(data.total))} címzett.` +
        (skipped
          ? ` ${formatNumber(skipped)} kimaradt, mert már benne van: ${(data.skippedIn as string[]).join(", ")}.`
          : ""),
    );
    setChosen(String(data.id));
    setName("");
    setBound({});
    setOpen(false);
    await load();
  };

  const start = async () => {
    const data = await post({ action: "start", id: chosen });
    if (!data) return;
    setNote(String(data.message ?? "Elindult."));
    onStarted();
  };

  const toggle = (account: Account) =>
    setBound((current) => {
      const next = { ...current };
      if (account.id in next) delete next[account.id];
      else next[account.id] = defaultLimit(account);
      return next;
    });

  const allKeys = files?.files.map((file) => file.key) ?? [];

  const scope = selectedIds.length
    ? `${formatNumber(selectedIds.length)} kijelölt cég`
    : "a szűrt lista (akinek van címe és még nem kapott)";

  return (
    <div className="space-y-2 border-b border-[var(--border)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Queue
        </span>
        <select
          aria-label="Queue kiválasztása"
          value={chosen}
          onChange={(event) => setChosen(event.target.value)}
          className={field("sm")}
        >
          <option value="">— válassz —</option>
          {queues.map((queue) => (
            <option key={queue.id} value={queue.id}>
              {queue.name} · {formatNumber(queue.total)} címzett
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !chosen}
          onClick={() => void start()}
          title="Azonnali indítás, az ütemezőt meg nem várva — csak a lokális szerveren"
          className={button("primary")}
        >
          Indítás most
        </button>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={button("secondary")}
        >
          {open ? "Mégse" : "＋ Mentés queue-ként"}
        </button>
        <Link href="/queues" className={button("ghost")}>
          Naptár →
        </Link>
        {note ? <span className="text-xs text-emerald-300">{note}</span> : null}
        {error ? (
          <span role="alert" className="text-xs text-red-300">
            {error}
          </span>
        ) : null}
      </div>

      {open ? (
        <form
          onSubmit={(event) => void save(event)}
          className="space-y-3 rounded-lg border border-[var(--border)] p-3"
        >
          <p className="text-xs text-[var(--muted)]">
            Bekerül: {scope}. A lista rögzített — aki most benne van, az kap
            levelet, a később felvett cégek nem. A queue a futás napján (üresen:
            ma) magától elindul a lokális szerveren, 7 és 19 óra között.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block text-[11px] uppercase tracking-wider text-[var(--muted)]">
                Név
              </span>
              <input
                value={name}
                required
                maxLength={80}
                placeholder="pl. US kis cégek"
                onChange={(event) => setName(event.target.value)}
                className={`${field("sm")} w-56`}
              />
            </label>
            <label className="space-y-1">
              <span className="block text-[11px] uppercase tracking-wider text-[var(--muted)]">
                Futás napja
              </span>
              <input
                type="date"
                value={runDate}
                onChange={(event) => setRunDate(event.target.value)}
                className={`${field("sm")} w-40`}
              />
            </label>
            <label className="space-y-1">
              <span className="block text-[11px] uppercase tracking-wider text-[var(--muted)]">
                Szünet (perc)
              </span>
              <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={minMinutes}
                  onChange={(event) =>
                    setMinMinutes(Number(event.target.value))
                  }
                  className={`${field("sm")} w-16`}
                />
                –
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={maxMinutes}
                  onChange={(event) =>
                    setMaxMinutes(Number(event.target.value))
                  }
                  className={`${field("sm")} w-16`}
                />
              </span>
            </label>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
              Bekötött fiókok és napi keretük
            </legend>
            <div className="flex flex-wrap gap-2">
              {accounts.map((account) => {
                const on = account.id in bound;
                return (
                  <span
                    key={account.id}
                    className={`flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs ${
                      on
                        ? "border-emerald-500 text-emerald-200"
                        : "border-[var(--border)] text-[var(--muted)]"
                    }`}
                  >
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(account)}
                        className="size-4 accent-emerald-500"
                      />
                      {account.label}
                      {account.provider === "resend" ? " · Resend" : ""}
                    </label>
                    {on ? (
                      <input
                        type="number"
                        aria-label={`${account.label} napi kerete`}
                        min={1}
                        max={100}
                        value={bound[account.id]}
                        onChange={(event) =>
                          setBound((current) => ({
                            ...current,
                            [account.id]: Number(event.target.value),
                          }))
                        }
                        className="h-6 w-14 rounded border border-[var(--border)] bg-[var(--surface-2)] px-1 text-foreground outline-none"
                      />
                    ) : null}
                  </span>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
              Csatolmányok
            </legend>
            {files?.files.length ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {files.files.map((file) => {
                    const on = (picked ?? allKeys).includes(file.key);
                    return (
                      <label
                        key={file.key}
                        title={
                          file.scope === "közös"
                            ? "Minden levélre felkerül."
                            : `Csak a(z) ${file.scope} nyelvű levelekre kerül fel.`
                        }
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
                            setPicked(
                              on
                                ? (picked ?? allKeys).filter(
                                    (key) => key !== file.key,
                                  )
                                : [...(picked ?? allKeys), file.key],
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
                <p className="text-xs text-[var(--muted)]">
                  {files.remote
                    ? "A fájlok a küldő gépen vannak, onnan mennek — itt csak kiválasztod őket. "
                    : ""}
                  {picked && !picked.length
                    ? "Válassz legalább egyet: csatolmány nélküli küldés queue-ból nem megy."
                    : ""}
                </p>
              </>
            ) : (
              <p className="text-xs text-amber-300">
                {files?.remote
                  ? "A küldő gép még nem tette közzé a csatolmányai listáját — indítsd el a lokális szervert. Így mentve a queue minden csatolmányt visz, ami küldéskor a gépen van."
                  : "Nincs fájl az attachments mappában — a levelek csatolmány nélkül mennek."}
              </p>
            )}
          </fieldset>

          <button
            type="submit"
            disabled={
              busy ||
              !Object.keys(bound).length ||
              Boolean(picked && !picked.length)
            }
            className={button("primary")}
          >
            {busy ? "Mentés…" : "Queue mentése"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
