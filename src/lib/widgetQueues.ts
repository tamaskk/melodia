/**
 * A queue-k mai állása a telefonos widgetnek (`GET /api/widget/queues`).
 *
 * Tiszta modul (adatbázis nélkül): a nap határai és a válasz összeállítása. Az adatot a `widgetQueuesData.ts` hozza.
 */
import { QUEUE_WINDOW_FROM } from "./queuePlan";

export const WIDGET_ZONE = "Europe/Budapest";

/** Ennyi ideig számít „épp megy” a levél, miután a várakozása lejárt. */
const SENDING_MS = 2 * 60_000;

/** Ennél régebbi életjelű kutatást már nem tekintünk futónak (elhalt folyamat). */
const STALE_MS = 20 * 60_000;

export type WidgetStatus = "running" | "paused" | "error" | "done" | "idle";

export interface WidgetCounts {
  total: number;
  done: number;
  failed: number;
  pending: number;
  inProgress: number;
}

export interface WidgetQueue extends WidgetCounts {
  id: string;
  name: string;
  type: "smtp" | "research";
  status: WidgetStatus;
  quota: { used: number; limit: number } | null;
  nextRunAt: string | null;
  lastActivityAt: string | null;
  completedAt: string | null;
}

export interface WidgetResponse {
  date: string;
  timezone: string;
  generatedAt: string;
  totals: WidgetCounts;
  queues: WidgetQueue[];
}

/* ------------------------------------------------------------------ */
/* A nap határai                                                        */
/* ------------------------------------------------------------------ */

/** Valódi `ÉÉÉÉ-HH-NN` dátum-e. */
export function isDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Ennyivel jár előrébb a budapesti óra az UTC-nél az adott pillanatban. */
function zoneOffsetMs(at: number): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WIDGET_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const local = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return local - Math.floor(at / 1000) * 1000;
}

/**
 * Egy budapesti falióra-időpont UTC-ben. Az eltolást az adott pillanatra
 * kérdezzük le (kétszer, hogy az óraátállítás napján is jó legyen) — nincs
 * beégetett +1/+2 óra.
 */
function zonedInstant(day: string, dayOffset = 0, hour = 0): number {
  const [year, month, date] = day.split("-").map(Number);
  const wall = Date.UTC(year, month - 1, date + dayOffset, hour);
  const first = wall - zoneOffsetMs(wall);
  return wall - zoneOffsetMs(first);
}

/** A budapesti nap 00:00–24:00 határai UTC-ben (`start` benne, `end` már nem). */
export function dayRange(day: string): { start: string; end: string } {
  return {
    start: new Date(zonedInstant(day)).toISOString(),
    end: new Date(zonedInstant(day, 1)).toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Összeállítás                                                         */
/* ------------------------------------------------------------------ */

export interface AccountInput {
  /** A fiók címe — a kiküldött levél `sentFrom` mezője is ez. */
  id: string;
  name: string;
  /** A fiók saját napi plafonja (felfuttatás vagy fiókmaximum); `null` = nincs. */
  cap: number | null;
}

/** Tartós nyom: a napon ebből a fiókból kiment első levelek. */
export interface SentInput {
  from: string;
  count: number;
  lastAt: string | null;
}

/** A fiók mentett kiküldő menete (`campaigns`). */
export interface CampaignInput {
  accountId: string;
  status: "idle" | "running" | "stopping" | "done" | "error";
  stopRequested: boolean;
  /** Ennyi címzett vár még a menet sorában. */
  queueLength: number;
  queueId: string | null;
  dailyLimit: number | null;
  /** A menet saját számlálója a kért napra (follow-uppal együtt), különben 0. */
  sentOnDate: number;
  nextAt: string | null;
  updatedAt: string | null;
}

/** A kért napra szóló queue (`send_queues`). */
export interface SendQueueInput {
  id: string;
  status: "varakozik" | "fut" | "kesz" | "leallitva";
  accounts: { accountId: string; dailyLimit: number }[];
  /** Akik még levelet kaphatnak belőle (csak be nem töltött queue-nál számít). */
  open: number;
}

/** Egy sor a `queue_daily_stats`-ból. */
export interface StatsInput {
  queueId: string;
  total: number;
  done: number;
  failed: number;
  inProgress: number;
  running: boolean;
  lastError: string | null;
  completedAt: string | null;
  updatedAt: string | null;
}

export interface WidgetInput {
  /** A kért nap és a mai nap, mindkettő budapesti naptár szerint. */
  date: string;
  today: string;
  accounts: AccountInput[];
  sent: SentInput[];
  campaigns: CampaignInput[];
  queues: SendQueueInput[];
  stats: StatsInput[];
}

const RESEARCH_NAMES: Record<string, string> = {
  "research:email": "E-mail-kutatás",
  "research:people": "Kapcsolattartó-kutatás",
};

const ORDER: WidgetStatus[] = ["error", "running", "paused", "idle", "done"];

function latest(...values: (string | null | undefined)[]): string | null {
  const times = values.filter((value): value is string => Boolean(value));
  return times.length ? times.sort().at(-1)! : null;
}

/** `open` darab szétosztása a bekötött fiókok között, a napi keret arányában. */
function split(
  open: number,
  accounts: { accountId: string; dailyLimit: number }[],
): Map<string, number> {
  const weight = accounts.reduce((sum, one) => sum + one.dailyLimit, 0);
  const out = new Map<string, number>();
  let given = 0;
  accounts.forEach((account, index) => {
    const share =
      index === accounts.length - 1
        ? open - given
        : Math.floor((open * account.dailyLimit) / Math.max(1, weight));
    out.set(account.accountId, share);
    given += share;
  });
  return out;
}

function smtpQueues(input: WidgetInput, now: Date): WidgetQueue[] {
  const range = dayRange(input.date);
  const inDay = (at: string | null | undefined) =>
    at && at >= range.start && at < range.end ? at : null;
  // Az élő állapot (futó menet) csak a mai napról mond valamit.
  const live = input.date === input.today;
  const sent = new Map(input.sent.map((row) => [row.from.toLowerCase(), row]));
  const campaigns = new Map(input.campaigns.map((row) => [row.accountId, row]));
  const stats = new Map(input.stats.map((row) => [row.queueId, row]));

  // A még be nem töltött queue-k címzettjei fiókonként; múltbeli napon ezek
  // már visszakerültek a listába, ott nincs hátralék.
  const waiting = new Map<string, number>();
  const stopped = new Set<string>();
  const scheduled = new Set<string>();
  const bound = new Map<string, number>();
  for (const queue of input.queues) {
    for (const account of queue.accounts) {
      bound.set(
        account.accountId,
        Math.max(bound.get(account.accountId) ?? 0, account.dailyLimit),
      );
    }
    if (input.date < input.today) continue;
    if (queue.status !== "varakozik" && queue.status !== "leallitva") continue;
    for (const [accountId, share] of split(queue.open, queue.accounts)) {
      if (!share) continue;
      waiting.set(accountId, (waiting.get(accountId) ?? 0) + share);
      (queue.status === "leallitva" ? stopped : scheduled).add(accountId);
    }
  }

  const out: WidgetQueue[] = [];
  for (const account of input.accounts) {
    const id = `smtp:${account.id}`;
    const sentRow = sent.get(account.id.toLowerCase());
    const stat = stats.get(id);
    const campaign = campaigns.get(account.id);
    const active =
      live &&
      campaign !== undefined &&
      (campaign.status === "running" || campaign.status === "stopping") &&
      !campaign.stopRequested;

    const done = sentRow?.count ?? 0;
    const failed = stat?.failed ?? 0;
    // Futó menetnél a sor eleje épp megy, ha a várakozás most járt le (vagy a
    // menet most indult) — régebbi időpont elakadt vagy elavult állapotot jelent.
    const since = active
      ? now.getTime() - Date.parse(campaign.nextAt ?? campaign.updatedAt ?? "")
      : NaN;
    const sending =
      active && campaign.queueLength > 0 && since >= 0 && since < SENDING_MS;
    const inProgress = sending ? 1 : 0;
    const pending =
      (active ? campaign.queueLength - inProgress : 0) +
      (waiting.get(account.id) ?? 0);
    const total = done + failed + pending + inProgress;
    if (!total && !active) continue;

    const used = Math.max(done, campaign?.sentOnDate ?? 0);
    const limits = [
      bound.get(account.id) ?? campaign?.dailyLimit ?? null,
      account.cap,
    ].filter((value): value is number => value !== null && value > 0);
    const limit = limits.length ? Math.min(...limits) : used;

    let status: WidgetStatus = "idle";
    if (active) status = "running";
    else if (live && campaign?.status === "error" && pending > 0)
      status = "error";
    else if (pending > 0 && (stopped.has(account.id) || used >= limit))
      status = "paused";
    else if (total > 0 && pending + inProgress === 0) status = "done";

    const lastActivityAt = latest(
      sentRow?.lastAt,
      inDay(stat?.updatedAt),
      inDay(campaign?.updatedAt),
    );
    const windowOpens = zonedInstant(input.date, 0, QUEUE_WINDOW_FROM);
    let nextRunAt: string | null = null;
    if (active) {
      nextRunAt =
        campaign.nextAt && Date.parse(campaign.nextAt) > now.getTime()
          ? campaign.nextAt
          : null;
    } else if (
      pending > 0 &&
      scheduled.has(account.id) &&
      windowOpens > now.getTime()
    ) {
      nextRunAt = new Date(windowOpens).toISOString();
    }

    out.push({
      id,
      name: account.name,
      type: "smtp",
      status,
      total,
      done,
      failed,
      pending,
      inProgress,
      quota: { used, limit },
      nextRunAt,
      lastActivityAt,
      completedAt: status === "done" ? lastActivityAt : null,
    });
  }
  return out;
}

function researchQueues(input: WidgetInput, now: Date): WidgetQueue[] {
  const out: WidgetQueue[] = [];
  for (const stat of input.stats) {
    if (!stat.queueId.startsWith("research:")) continue;
    const fresh =
      stat.running &&
      stat.updatedAt !== null &&
      now.getTime() - Date.parse(stat.updatedAt) < STALE_MS;
    const done = Math.max(0, stat.done);
    const failed = Math.max(0, stat.failed);
    const inProgress = fresh ? Math.max(0, stat.inProgress) : 0;
    const pending = Math.max(0, stat.total - done - failed - inProgress);
    const total = done + failed + pending + inProgress;
    if (!total && !fresh) continue;

    let status: WidgetStatus = "idle";
    if (fresh) status = "running";
    else if (stat.lastError && pending > 0) status = "error";
    else if (pending > 0) status = "paused";
    else if (total > 0) status = "done";

    out.push({
      id: stat.queueId,
      name: RESEARCH_NAMES[stat.queueId] ?? stat.queueId,
      type: "research",
      status,
      total,
      done,
      failed,
      pending,
      inProgress,
      quota: null,
      nextRunAt: null,
      lastActivityAt: stat.updatedAt,
      completedAt:
        status === "done" ? (stat.completedAt ?? stat.updatedAt) : null,
    });
  }
  return out;
}

/** A widget teljes válasza a behozott adatokból. */
export function assembleWidget(input: WidgetInput, now: Date): WidgetResponse {
  const queues = [
    ...smtpQueues(input, now),
    ...researchQueues(input, now),
  ].sort(
    (a, b) =>
      ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
      a.name.localeCompare(b.name, "hu"),
  );
  const totals: WidgetCounts = {
    total: 0,
    done: 0,
    failed: 0,
    pending: 0,
    inProgress: 0,
  };
  for (const queue of queues) {
    totals.total += queue.total;
    totals.done += queue.done;
    totals.failed += queue.failed;
    totals.pending += queue.pending;
    totals.inProgress += queue.inProgress;
  }
  return {
    date: input.date,
    timezone: WIDGET_ZONE,
    generatedAt: now.toISOString(),
    totals,
    queues,
  };
}
