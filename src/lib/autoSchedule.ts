/**
 * Automatikus ütemezés: a szűrt (vagy kijelölt) címzetteket napokra és
 * fiókokra osztja, és mindegyik (nap, fiók) párra külön queue-t tervez.
 *
 * A lehető leghamarabb tölt: napról napra, a fiókok sorrendjében, mindig a
 * fiók aznapi szabad keretéig — a felfuttatás későbbi, magasabb lépcsőivel és
 * a már betervezett queue-kkal együtt számolva. Egyenletes elosztás nincs.
 *
 * Két mód: `range` = két dátum között, ami nem fér bele, kimarad · `all` =
 * addig megy előre, amíg a címzettek el nem fogynak.
 */
import { ObjectId } from "mongodb";
import { getAccount, listAccounts } from "./accounts";
import type { MailProvider } from "./accountStore";
import { listContactIds } from "./contacts";
import { getContacts } from "./mongodb";
import {
  dayKey,
  dayKeys,
  planQueue,
  remainingToday,
  type DayLimit,
  type PlanAccount,
} from "./queuePlan";
import {
  createPlannedQueues,
  liveUsage,
  type PlannedQueue,
} from "./sendQueues";
import type { ContactFilters } from "./types";

/** Egy futtatás legfeljebb ennyi címzettel dolgozik. */
const LEAD_CAP = 20_000;
/** Egyéni időszak legfeljebb ennyi nap lehet. */
const RANGE_DAYS = 366;
/** „Összes” módban ennyi napot nézünk előre — a terv hamarabb megáll, ha elfogyott. */
const HORIZON_DAYS = 1500;
/** A queue-ban tárolható legnagyobb napi keret (`sendQueues.ts`). */
const QUEUE_LIMIT = 100;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export interface AutoScheduleInput {
  filters?: ContactFilters;
  /** Kijelölt sorok; üresen a szűrt lista megy. */
  ids?: unknown;
  mode?: unknown;
  /** Kezdőnap (`ÉÉÉÉ-HH-NN`); üresen holnap. */
  from?: unknown;
  /** Zárónap — csak `range` módban. */
  to?: unknown;
  weekends?: unknown;
  /** Mely fiókokra; üresen mind. */
  accountIds?: unknown;
  minMinutes?: unknown;
  maxMinutes?: unknown;
  attachments?: unknown;
  /** A queue-k nevének eleje. */
  prefix?: unknown;
}

/** Egy tervezett queue az előnézetben: egy nap, egy fiók. */
export interface AutoQueue {
  accountId: string;
  label: string;
  provider: MailProvider;
  name: string;
  /** Ennyi címzett kerül bele; 0, ha aznap a fióknál már nincs hely. */
  count: number;
  /** A fiók aznapi kerete, a legszűkebb korlát, és ami ebből már foglalt. */
  limit: DayLimit;
  contactIds: string[];
}

export interface AutoPlan {
  mode: "range" | "all";
  from: string;
  to: string | null;
  /** Ennyi küldhető, még queue-n kívüli címzett van a szűrésben. */
  leads: number;
  /** Ennél több volt — a futtatás csak az első `LEAD_CAP`-pal számolt. */
  capped: boolean;
  placed: number;
  leftover: number;
  /** Az utolsó nap, amire jutott címzett. */
  lastDay: string | null;
  days: { day: string; queues: AutoQueue[] }[];
}

const number = (value: unknown, fallback: number) =>
  Number.isFinite(Number(value)) && Number(value) > 0
    ? Number(value)
    : fallback;

/** A küldhető, még egyik queue-ban sem lévő címzettek, cégnév szerint. */
async function leadIds(input: AutoScheduleInput): Promise<string[]> {
  const picked = Array.isArray(input.ids)
    ? input.ids.filter(
        (id): id is string => typeof id === "string" && ObjectId.isValid(id),
      )
    : [];
  if (!picked.length) {
    return listContactIds(
      {
        ...(input.filters ?? {}),
        hasEmail: "yes",
        sent: "no",
        outcome: "none",
        inQueue: "no",
        sort: "company",
      },
      LEAD_CAP + 1,
    );
  }
  const docs = await (
    await getContacts()
  )
    .find(
      {
        _id: { $in: picked.map((id) => new ObjectId(id)) },
        primaryEmail: { $ne: null },
        sent: false,
        outcome: null,
        queueId: null,
      } as never,
      { projection: { _id: 1 } },
    )
    .sort({ company: 1 })
    .limit(LEAD_CAP + 1)
    .toArray();
  return docs.map((doc) => doc._id.toString());
}

/** A terv kiszámítása. Semmit nem ír — az előnézet és a létrehozás is ezt hívja. */
export async function planAutoSchedule(
  input: AutoScheduleInput,
  now = new Date(),
): Promise<AutoPlan> {
  const prefix = typeof input.prefix === "string" ? input.prefix.trim() : "";
  if (!prefix) throw new Error("Adj nevet (előtagot) a queue-knak.");

  const mode = input.mode === "range" ? "range" : "all";
  const today = dayKey(now);
  const [tomorrow] = dayKeys(now, 1, 1);
  const from =
    typeof input.from === "string" && input.from ? input.from : tomorrow;
  if (!DAY.test(from))
    throw new Error("A kezdőnap ÉÉÉÉ-HH-NN alakú dátum legyen.");
  if (from < today) throw new Error("A kezdőnap nem lehet a múltban.");

  const start = new Date(`${from}T12:00:00Z`);
  let count = HORIZON_DAYS;
  let to: string | null = null;
  if (mode === "range") {
    to = typeof input.to === "string" ? input.to : "";
    if (!DAY.test(to)) throw new Error("Add meg az időszak utolsó napját.");
    if (to < from) throw new Error("Az utolsó nap nem lehet a kezdőnap előtt.");
    count =
      Math.round(
        (new Date(`${to}T12:00:00Z`).getTime() - start.getTime()) / DAY_MS,
      ) + 1;
    if (count > RANGE_DAYS) {
      throw new Error(`Az időszak legfeljebb ${RANGE_DAYS} nap lehet.`);
    }
  }
  const days = dayKeys(start, 0, count);

  const wanted = Array.isArray(input.accountIds)
    ? new Set(input.accountIds.filter((id) => typeof id === "string"))
    : null;
  const accounts = listAccounts().filter(
    (account) => !wanted || wanted.has(account.id),
  );
  if (!accounts.length) throw new Error("Jelölj ki legalább egy küldő fiókot.");

  const minMinutes = number(input.minMinutes, 10);
  const maxMinutes = Math.max(minMinutes, number(input.maxMinutes, 20));
  const weekends = input.weekends === true;

  const [found, usage] = await Promise.all([leadIds(input), liveUsage(now)]);
  const capped = found.length > LEAD_CAP;
  const leads = capped ? found.slice(0, LEAD_CAP) : found;

  const plan = planQueue(
    {
      remaining: leads.length,
      // A queue-ban kért keret itt nem szűkít: a fiók saját beállítása dönt.
      accounts: accounts.map((account): PlanAccount => ({
        id: account.id,
        provider: account.provider,
        dailyLimit: QUEUE_LIMIT,
        firstSendAt: account.warmupStart ?? usage.first.get(account.id) ?? null,
        warmupSteps: account.warmupSteps,
        warmup: account.warmup,
        dailyMax: account.dailyMax,
      })),
      minMinutes,
      maxMinutes,
      today: { day: today, cap: remainingToday(now, minMinutes, maxMinutes) },
      weekends,
    },
    days,
    usage.used,
  );

  // A címzettek sorban fogynak: napról napra, a fiókok sorrendjében.
  const out: AutoPlan["days"] = [];
  let offset = 0;
  let lastDay: string | null = null;
  for (const day of days) {
    const queues: AutoQueue[] = [];
    for (const account of accounts) {
      const limit = plan.limits.get(account.id)?.get(day);
      if (!limit) continue;
      const take = plan.cells.get(account.id)?.get(day) ?? 0;
      queues.push({
        accountId: account.id,
        label: account.label,
        provider: account.provider,
        name: `${prefix} · ${day.slice(5).replace("-", ".")}. · ${account.label}`,
        count: take,
        limit,
        contactIds: leads.slice(offset, offset + take),
      });
      offset += take;
    }
    if (queues.some((queue) => queue.count)) {
      out.push({ day, queues });
      lastDay = day;
    } else if (queues.length && offset < leads.length) {
      // Teli nap a tervezett szakaszon belül: látsszon, miért maradt ki.
      out.push({ day, queues });
    }
    if (offset >= leads.length) break;
  }
  // A végéről a már üres napok lekerülnek — azok nem a tervhez tartoznak.
  while (
    out.length &&
    !out[out.length - 1].queues.some((queue) => queue.count)
  ) {
    out.pop();
  }

  return {
    mode,
    from,
    to,
    leads: leads.length,
    capped,
    placed: offset,
    leftover: leads.length - offset,
    lastDay,
    days: out,
  };
}

/** A terv végrehajtása: újraszámol (a kliens tervében nem bízunk), és létrehoz. */
export async function applyAutoSchedule(input: AutoScheduleInput): Promise<{
  created: number;
  placed: number;
  leftover: number;
  lastDay: string | null;
}> {
  const plan = await planAutoSchedule(input);
  const planned: PlannedQueue[] = plan.days.flatMap(({ day, queues }) =>
    queues
      .filter((queue) => queue.count > 0)
      .map((queue) => ({
        name: queue.name,
        runDate: day,
        accountId: queue.accountId,
        // A queue kerete a fiók aznapi kerete: indításkor a pontos szám újra eldől.
        dailyLimit: Math.max(
          queue.count,
          Math.min(queue.limit.cap, QUEUE_LIMIT),
        ),
        contactIds: queue.contactIds,
      })),
  );
  if (!planned.length) {
    throw new Error(
      "Nincs mit elhelyezni: nincs küldhető címzett, vagy a megadott napokon minden fiók tele van.",
    );
  }
  const created = await createPlannedQueues(planned, {
    minMinutes: number(input.minMinutes, 10),
    maxMinutes: number(input.maxMinutes, 20),
    attachments: input.attachments,
    weekends: input.weekends === true,
  });
  return {
    created,
    placed: plan.placed,
    leftover: plan.leftover,
    lastDay: plan.lastDay,
  };
}

/** Néhány címzett neve és címe az előnézethez — a kért sorrendben. */
export async function leadNames(
  ids: unknown,
): Promise<{ id: string; company: string; email: string | null }[]> {
  const wanted = (Array.isArray(ids) ? ids : [])
    .filter(
      (id): id is string => typeof id === "string" && ObjectId.isValid(id),
    )
    .slice(0, 200);
  const docs = await (
    await getContacts()
  )
    .find({ _id: { $in: wanted.map((id) => new ObjectId(id)) } } as never, {
      projection: { company: 1, primaryEmail: 1 },
    })
    .toArray();
  const byId = new Map(docs.map((doc) => [doc._id.toString(), doc]));
  return wanted.flatMap((id) => {
    const doc = byId.get(id);
    return doc
      ? [{ id, company: doc.company, email: doc.primaryEmail ?? null }]
      : [];
  });
}

/** A panel választói: mely fiókokra lehet ütemezni. */
export function scheduleAccounts() {
  return listAccounts().map((account) => ({
    id: account.id,
    label: getAccount(account.id)?.label ?? account.id,
    provider: account.provider,
  }));
}
