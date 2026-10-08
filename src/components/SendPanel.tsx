"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReportActive } from "./useReportActive";
import { useStatusPoll } from "./useStatusPoll";
import { TEST_MODE_LIMIT } from "@/lib/sendWindow";
import Link from "next/link";
import QueueBar from "./QueueBar";
import SendPreview, {
  type PreflightCheck,
  type PreviewItem,
  type PreviewSkipped,
} from "./SendPreview";
import { formatNumber } from "@/lib/format";
import RunMessage from "./RunMessage";

interface SentItem {
  company: string;
  email: string;
  at: string;
  attachments?: string[];
  error?: string;
}

interface AttachmentFile {
  key: string;
  name: string;
  bytes: number;
  scope: string;
}

interface Account {
  id: string;
  user: string;
  label: string;
  provider?: "gmail" | "resend";
}

interface CampaignState {
  accountId: string;
  accountUser: string;
  accountLabel: string;
  status: "idle" | "running" | "stopping" | "done" | "error";
  sentToday: number;
  dailyLimit: number;
  processed: number;
  failed: number;
  remaining: number;
  current: string | null;
  nextAt: string | null;
  message: string | null;
  minMinutes: number;
  maxMinutes: number;
  windowFrom: number;
  windowTo: number;
  ignoreWindow?: boolean;
  /** Teszt mód: ablak nélkül, de indításonként max. néhány levél. */
  testMode?: boolean;
  /** A szerveren futó kampány kiválasztott fájljai. */
  selectedAttachments?: string[];
  recent: SentItem[];
  skipped?: { sameEmail: number; sameDomain: number; inQueue: number };
  /** Felfuttatási plafon (új fiók), vagy `null`. */
  warmupCap?: number | null;
  /** A fiók saját napi maximuma (Küldő fiókok oldal), vagy `null`. */
  accountMax?: number | null;
}

interface CampaignFeed {
  accounts: Account[];
  campaigns: CampaignState[];
  configured: boolean;
  /** Van-e nyilvános CV-link (CV_URL) — a CV-link opcióhoz. */
  cvUrl?: boolean;
  attachments?: {
    dir: string;
    files: AttachmentFile[];
    warning: string | null;
  };
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function countdown(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.max(
    0,
    Math.round((new Date(iso).getTime() - Date.now()) / 1000),
  );
  if (seconds < 60) return `${seconds} mp`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} perc`;
}

const isActive = (campaign?: CampaignState | null) =>
  campaign?.status === "running" || campaign?.status === "stopping";

/**
 * Ütemezett kiküldés: egy gomb, aztán a szerver küldi a leveleket egyesével,
 * véletlen szünetekkel, napi kerettel. A doboz csak nézi és megállítja.
 *
 * Több Gmail-fiók is beállítható; mindegyik külön menetben, külön napi
 * kerettel megy, és egyszerre több is futhat. A felső sávban látszik, melyik
 * fut éppen és hol tart.
 */
/**
 * A tényleges napi keret: a beállított, a felfuttatási plafon és a fiók saját
 * maximuma közül a legkisebb.
 */
function limitOf(campaign: {
  dailyLimit: number;
  warmupCap?: number | null;
  accountMax?: number | null;
}): number {
  return Math.min(
    campaign.dailyLimit,
    campaign.warmupCap || Infinity,
    campaign.accountMax || Infinity,
  );
}

export default function SendPanel({
  filters,
  selectedIds,
  aiEnabled = false,
  onSent,
  onActiveChange,
}: {
  filters: Record<string, string>;
  selectedIds: string[];
  /** Van-e OpenAI kulcs — ettől függ az előnézetben az AI-átírás. */
  aiEnabled?: boolean;
  onSent: () => void;
  /** Jelzés a szülőnek, ha a futás elindult vagy leállt. */
  onActiveChange?: (active: boolean) => void;
}) {
  const [feed, setFeed] = useState<CampaignFeed | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState(40);
  const [minMinutes, setMinMinutes] = useState(10);
  const [maxMinutes, setMaxMinutes] = useState(20);
  // Alapból csak munkaidőben küld; teszthez ezzel kikapcsolható.
  // Munkaidőn kívül is: az ablak kikapcsolva, korlát nélkül (megerősítéssel).
  const [ignoreWindow, setIgnoreWindow] = useState(false);
  // Teszt mód: szintén ablak nélkül, de indításonként max. néhány levél.
  const [testMode, setTestMode] = useState(false);
  // Alapból egy cégdomainre egy levél; fiókirodáknál (külön cím) bekapcsolható.
  const [allowSameDomain, setAllowSameDomain] = useState(false);
  // Csatolmány helyett CV-link — csak ha a CV_URL be van állítva.
  const [cvLink, setCvLink] = useState(false);
  // Melyik fájlok menjenek. Üres halmaz = még nem választottál, ilyenkor mind megy.
  const [picked, setPicked] = useState<string[] | null>(null);
  // Küldés előtti előnézet: mit kapna pontosan az első N címzett.
  const [preview, setPreview] = useState<{
    items: PreviewItem[];
    total: number;
    skipped: PreviewSkipped | null;
    checks: PreflightCheck[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/contacts/send-campaign", {
        cache: "no-store",
      });
      if (response.ok) setFeed((await response.json()) as CampaignFeed);
    } catch {
      // a következő kör újrapróbálja
    }
  }, []);

  const accounts = feed?.accounts ?? [];
  // Stabil azonosító kell: enélkül a "kész" figyelő hatás minden rendernél futna.
  const campaigns = useMemo(() => feed?.campaigns ?? [], [feed]);
  const current = accountId ?? accounts[0]?.id ?? null;
  const state =
    campaigns.find((campaign) => campaign.accountId === current) ?? null;
  const active = isActive(state);
  // A lekérdezés ritmusát bármelyik futó fiók sűrítse — nem csak a kiválasztott.
  const anyActive = campaigns.some(isActive);
  useReportActive(anyActive, onActiveChange);

  // Csak futás közben pollolunk; nyugalomban induláskor és fókuszváltáskor.
  useStatusPoll(refresh, anyActive, 5000);

  // A visszaszámláló másodpercenként frissül, kérés nélkül.
  useEffect(() => {
    if (!anyActive) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [anyActive]);

  // A szerver "kész" állapota megmarad, a szülő `onSent` függvénye viszont
  // rendernként új. Refben tartjuk, és csak a tényleges váltásnál jelzünk.
  const sentCallback = useRef(onSent);
  useEffect(() => {
    sentCallback.current = onSent;
  });

  const seenStatus = useRef<Record<string, string>>({});
  useEffect(() => {
    let finished = false;
    for (const campaign of campaigns) {
      const previous = seenStatus.current[campaign.accountId];
      seenStatus.current[campaign.accountId] = campaign.status;
      if (previous && previous !== "done" && campaign.status === "done")
        finished = true;
    }
    if (finished) sentCallback.current();
  }, [campaigns]);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const response = await fetch("/api/contacts/send-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: current, ...body }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hiba");
      // A tesztek `{ok, message}` alakot adnak vissza, nem kampányállapotot —
      // ezt üzenetként mutatjuk, különben hiányos state kerülne a felületre.
      if (body.action === "preview") {
        setPreview({
          items: (data.items ?? []) as PreviewItem[],
          total: Number(data.total ?? 0),
          skipped: (data.skipped ?? null) as PreviewSkipped | null,
          checks: (data.checks ?? []) as PreflightCheck[],
        });
      } else if (body.action === "test" || body.action === "self-test") {
        setNote(data.message as string);
        if (!data.ok) setError(data.message as string);
      } else if (Array.isArray((data as CampaignState).recent)) {
        // Egy fiók állapota jött vissza — a többit a következő lekérdezés hozza.
        const updated = data as CampaignState;
        setFeed((old) =>
          old
            ? {
                ...old,
                campaigns: old.campaigns.map((campaign) =>
                  campaign.accountId === updated.accountId ? updated : campaign,
                ),
              }
            : old,
        );
        setOpen(true);
      } else {
        setNote(String(data.message ?? "Kész."));
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const allKeys = feed?.attachments?.files?.map((file) => file.key) ?? [];
  // Amíg nem nyúlsz hozzá, minden fájl megy — utána a te választásod érvényes.
  const selectedKeys = picked ?? allKeys;
  const countFor = (language: "hu" | "en") =>
    (feed?.attachments?.files ?? []).filter(
      (file) =>
        selectedKeys.includes(file.key) &&
        (file.scope === "közös" || file.scope === language),
    ).length;
  const huCount = countFor("hu");
  const enCount = countFor("en");

  const startNow = async () => {
    // Ablak nélküli küldés csak megerősítéssel indulhat.
    if (
      testMode &&
      !window.confirm(
        `Teszt mód: a munkaidőtől függetlenül küld (akár most éjjel is), de legfeljebb ${TEST_MODE_LIMIT} levelet, utána leáll.\n\nMehet?`,
      )
    ) {
      return;
    }
    if (
      !testMode &&
      ignoreWindow &&
      !window.confirm(
        "Munkaidőn kívül is: a levelek éjjel és hétvégén is kimennek, a napi keretig — a címzett helyi idejét sem nézi.\n\nMehet?",
      )
    ) {
      return;
    }
    setPreview(null);
    await send({
      action: "start",
      ids: selectedIds,
      filters: selectedIds.length ? {} : filters,
      dailyLimit,
      minMinutes,
      maxMinutes,
      ignoreWindow,
      testMode,
      attachments: selectedKeys,
      allowSameDomain,
      cvLink: cvLink && Boolean(feed?.cvUrl),
    });
  };

  const scopeLabel = selectedIds.length
    ? `${formatNumber(selectedIds.length)} kijelölt`
    : "a szűrt lista (akinek van címe és még nem kapott)";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      {preview ? (
        <SendPreview
          key={preview.items.map((item) => item.id).join(",")}
          items={preview.items}
          total={preview.total}
          skipped={preview.skipped}
          checks={preview.checks}
          aiEnabled={aiEnabled}
          busy={busy}
          onClose={() => setPreview(null)}
          onStart={() => void startNow()}
        />
      ) : null}

      {accounts.length ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Küldő fiók
          </span>
          {accounts.map((account) => {
            const campaign = campaigns.find(
              (item) => item.accountId === account.id,
            );
            const running = isActive(campaign);
            const chosen = account.id === current;
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => setAccountId(account.id)}
                title={account.user}
                className={`flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs transition ${
                  chosen
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
                    : "border-[var(--border)] text-[var(--muted)] hover:border-emerald-500"
                }`}
              >
                <span
                  className={
                    running
                      ? "animate-pulse text-emerald-400"
                      : campaign?.status === "error"
                        ? "text-red-400"
                        : "text-[var(--muted)]"
                  }
                >
                  ●
                </span>
                <span className="font-medium">{account.label}</span>
                {campaign ? (
                  <span className="tabular-nums">
                    {campaign.sentToday}/
                    {/* Álló fióknál az számít, amit most indítanál — nem a legutóbbi menet kerete. */}
                    {limitOf(running ? campaign : { ...campaign, dailyLimit })}
                    {campaign.warmupCap ? (
                      <span
                        className="text-amber-300"
                        title="Felfuttatás: új fióknál hetente nő a napi keret (10 → 20 → 30), hogy a Google ne nézze spamnek"
                      >
                        {" "}
                        ↗
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {running ? (
                  <span className="max-w-[160px] truncate text-emerald-300">
                    {campaign?.current
                      ? campaign.current
                      : campaign?.nextAt
                        ? `⏱ ${countdown(campaign.nextAt)}`
                        : "…"}
                  </span>
                ) : null}
              </button>
            );
          })}

          {campaigns.filter(isActive).length > 1 ? (
            <span className="text-[11px] text-emerald-300">
              {campaigns.filter(isActive).length} fiók küld egyszerre
            </span>
          ) : null}
        </div>
      ) : null}

      {accounts.length ? (
        <QueueBar
          accounts={accounts}
          selectedIds={selectedIds}
          filters={filters}
          onStarted={() => void refresh()}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2 p-3">
        <button
          type="button"
          disabled={busy || active}
          onClick={() =>
            void send({
              action: "preview",
              ids: selectedIds,
              filters: selectedIds.length ? {} : filters,
              dailyLimit,
              minMinutes,
              maxMinutes,
              ignoreWindow,
              attachments: selectedKeys,
              allowSameDomain,
            })
          }
          className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
        >
          {active ? "Küldés fut…" : "✉️ Előnézet és küldés"}
        </button>

        {active ? (
          <button
            type="button"
            disabled={busy || state?.status === "stopping"}
            onClick={() => void send({ action: "stop" })}
            className="h-9 rounded-lg border border-red-500/60 px-3 text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
          >
            {state?.status === "stopping" ? "Leáll…" : "Leállítás"}
          </button>
        ) : (
          <>
            <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              Napi max:
              <input
                type="number"
                min={1}
                max={100}
                value={dailyLimit}
                onChange={(event) => setDailyLimit(Number(event.target.value))}
                className="h-8 w-16 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm text-foreground outline-none focus:border-emerald-500"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              Szünet:
              <input
                type="number"
                min={1}
                max={120}
                value={minMinutes}
                onChange={(event) => setMinMinutes(Number(event.target.value))}
                className="h-8 w-14 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm text-foreground outline-none focus:border-emerald-500"
              />
              –
              <input
                type="number"
                min={1}
                max={240}
                value={maxMinutes}
                onChange={(event) => setMaxMinutes(Number(event.target.value))}
                className="h-8 w-14 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm text-foreground outline-none focus:border-emerald-500"
              />
              perc
            </label>
            <label
              className="flex items-center gap-1.5 text-xs text-[var(--muted)]"
              title="Éjjel és hétvégén is küld, a napi keretig, a címzett helyi idejétől függetlenül. Indítás előtt megerősítést kér."
            >
              <input
                type="checkbox"
                checked={ignoreWindow}
                onChange={(event) => setIgnoreWindow(event.target.checked)}
                className="size-4 accent-amber-500"
              />
              munkaidőn kívül is
            </label>
            <label
              className="flex items-center gap-1.5 text-xs text-[var(--muted)]"
              title={`Kipróbáláshoz: a munkaidőtől függetlenül küld, de indításonként legfeljebb ${TEST_MODE_LIMIT} levelet, utána leáll.`}
            >
              <input
                type="checkbox"
                checked={testMode}
                onChange={(event) => setTestMode(event.target.checked)}
                className="size-4 accent-amber-500"
              />
              teszt mód (max. {TEST_MODE_LIMIT} levél)
            </label>
            <label
              className="flex items-center gap-1.5 text-xs text-[var(--muted)]"
              title="Alapból egy cégdomainre (pl. @cegnev.hu) csak egy levél megy. Fiókirodáknál, ahol minden iroda külön címet kap, kapcsold be."
            >
              <input
                type="checkbox"
                checked={allowSameDomain}
                onChange={(event) => setAllowSameDomain(event.target.checked)}
                className="size-4 accent-emerald-500"
              />
              egy cégre több levél is (fiókirodák)
            </label>
            <label
              className={`flex items-center gap-1.5 text-xs ${
                feed?.cvUrl ? "text-[var(--muted)]" : "text-[var(--muted)]/50"
              }`}
              title={
                feed?.cvUrl
                  ? "Csatolmány helyett a CV linkje a levél végén — a szűrők a PDF-es első levelet gyanúsabbnak látják. A cv-link címkével később mérhető, melyik hoz több választ."
                  : "Ehhez egy nyilvános CV-link kell: CV_URL az atlas-credentials.env-ben (pl. a portfóliódon), utána újraindítás."
              }
            >
              <input
                type="checkbox"
                disabled={!feed?.cvUrl}
                checked={cvLink && Boolean(feed?.cvUrl)}
                onChange={(event) => setCvLink(event.target.checked)}
                className="size-4 accent-emerald-500"
              />
              CV-link a csatolmány helyett
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void send({ action: "test" })}
              className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs transition hover:border-emerald-500"
            >
              Kapcsolat tesztelése
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void send({
                  action: "self-test",
                  ids: selectedIds.slice(0, 1),
                  attachments: selectedKeys,
                })
              }
              title="Elküldi magadnak az első sorba álló cég levelét, csatolmányokkal. A cég nem kap semmit."
              className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs transition hover:border-emerald-500"
            >
              Próbalevél magamnak
            </button>
          </>
        )}

        <span className="text-xs text-[var(--muted)]">
          {scopeLabel} ·{" "}
          {testMode || state?.testMode ? (
            <span className="text-amber-300">
              teszt mód: legfeljebb {TEST_MODE_LIMIT} levél, bármikor
            </span>
          ) : ignoreWindow || state?.ignoreWindow ? (
            <span className="text-amber-300">
              munkaidőn kívül is küld (éjjel, hétvégén)
            </span>
          ) : (
            "munkanap 9–17, a címzett helyi idejében"
          )}{" "}
          · egyesével
        </span>

        <Link
          href="/debug"
          target="_blank"
          className="ml-auto text-xs text-emerald-400 hover:underline"
        >
          konzol ↗
        </Link>

        {state && (state.recent?.length ?? 0) > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs transition hover:border-emerald-500"
          >
            {open ? "Részletek elrejtése" : "Részletek"}
          </button>
        ) : null}
      </div>

      {feed && feed.configured === false ? (
        <p className="px-3 pb-2 text-xs text-amber-300">
          A küldés még nincs beállítva: tedd be a <code>GMAIL_USER</code> és{" "}
          <code>GMAIL_APP_PASSWORD</code> értéket az{" "}
          <code>atlas-credentials.env</code>
          fájlba (Google app-jelszó, kétlépcsős azonosítással), majd indítsd
          újra a szervert. További fiókok: <code>GMAIL_USER_2</code>,{" "}
          <code>GMAIL_APP_PASSWORD_2</code> …
        </p>
      ) : null}

      {feed?.attachments ? (
        <div className="space-y-1 border-t border-[var(--border)] px-3 py-2 text-xs">
          {(feed.attachments.files?.length ?? 0) === 0 ? (
            <p className="text-amber-300">
              Nincs csatolmány. Tedd a fájlokat ebbe a mappába:{" "}
              <code className="text-[var(--muted)]">
                {feed.attachments.dir}
              </code>
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[var(--muted)]">Csatolmányok:</span>
                {(feed.attachments.files ?? []).map((file) => {
                  const on = selectedKeys.includes(file.key);
                  return (
                    <label
                      key={file.key}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 transition ${
                        on
                          ? "bg-emerald-500/15 text-emerald-200"
                          : "bg-[var(--surface-2)] text-[var(--muted)] line-through"
                      }`}
                      title={
                        file.scope === "közös"
                          ? "Minden levélre felkerül."
                          : `Csak a(z) ${file.scope} nyelvű levelekre kerül fel.`
                      }
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={active}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [...selectedKeys, file.key]
                            : selectedKeys.filter((key) => key !== file.key);
                          setPicked(next);
                        }}
                        className="size-3.5 accent-emerald-500"
                      />
                      📎 {file.name}
                      <span className="text-[11px] text-[var(--muted)]">
                        {size(file.bytes)}
                        {file.scope === "közös" ? "" : ` · csak ${file.scope}`}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-[var(--muted)]">
                A magyar nyelvű címzett {huCount} fájlt kap, az angol {enCount}
                -at. A nyelvi mappában lévő fájl (`en/`, `hu/`) csak az adott
                nyelvű levélre kerül fel.
              </p>
            </>
          )}
          {feed.attachments.warning ? (
            <p className="text-red-300">{feed.attachments.warning}</p>
          ) : null}
        </div>
      ) : null}

      {note && !error ? (
        <p className="px-3 pb-2 text-xs text-emerald-400">{note}</p>
      ) : null}
      {error ? <p className="px-3 pb-2 text-xs text-red-300">{error}</p> : null}

      {state && (active || state.processed > 0 || state.status === "error") ? (
        <div className="space-y-2 border-t border-[var(--border)] p-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">
              {state.accountLabel}: ma {state.sentToday}/{limitOf(state)}
              {state.warmupCap
                ? ` (felfuttatás, max. ${state.warmupCap}/nap)`
                : ""}{" "}
              levél
            </span>
            <div className="h-2 min-w-[140px] flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: `${Math.min(100, (state.sentToday / state.dailyLimit) * 100)}%`,
                }}
              />
            </div>
            <span className="text-xs text-[var(--muted)]">
              {formatNumber(state.remaining)} vár még
              {state.failed ? ` · ${state.failed} hiba` : ""}
            </span>
          </div>

          {state.current ? (
            <p className="text-xs text-emerald-300">
              <span className="animate-pulse">●</span> most: {state.current}
            </p>
          ) : active && state.nextAt ? (
            <p className="text-xs text-[var(--muted)]">
              következő levél: {countdown(state.nextAt)} múlva
            </p>
          ) : null}

          {state.skipped &&
          (state.skipped.sameEmail ||
            state.skipped.sameDomain ||
            state.skipped.inQueue) ? (
            <p className="text-xs text-[var(--muted)]">
              Kihagyva:{" "}
              {[
                state.skipped.sameEmail
                  ? `${state.skipped.sameEmail} — erre a címre már ment levél`
                  : null,
                state.skipped.sameDomain
                  ? `${state.skipped.sameDomain} — erre a cégre már ment levél`
                  : null,
                state.skipped.inQueue
                  ? `${state.skipped.inQueue} — kétszer szerepelt a sorban`
                  : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          ) : null}
          <RunMessage
            status={state.status}
            message={state.message}
            scope="kuldes"
          />

          {open ? (
            <div className="max-h-56 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 font-mono text-[11px]">
              {(state.recent ?? []).map((item, index) => (
                <div
                  key={`${item.email}-${index}`}
                  className="flex flex-wrap items-center gap-2 border-b border-[var(--border)]/40 py-1"
                >
                  <span className="min-w-[200px]">{item.company}</span>
                  <span className="text-emerald-200">{item.email}</span>
                  {item.error ? (
                    <span className="text-red-400">
                      hiba: {item.error.slice(0, 70)}
                    </span>
                  ) : (
                    <>
                      <span className="text-[var(--muted)]">
                        {new Date(item.at).toLocaleTimeString("hu-HU")}
                      </span>
                      {item.attachments?.length ? (
                        <span className="text-[var(--muted)]">
                          📎 {item.attachments.length}
                        </span>
                      ) : null}
                      <span className="text-emerald-400">kész ✓</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
