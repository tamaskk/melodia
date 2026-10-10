/**
 * A widget adatai az adatbázisból: öt kis, indexelt lekérdezés egyszerre.
 * Semmit nem módosít, és listát nem húz át — a számolás a szerveren történik.
 */
import { ensureAccounts, listAccounts } from "./accounts";
import { getContacts, getDb } from "./mongodb";
import { dayKey } from "./queuePlan";
import { queueStats } from "./queueStats";
import { warmupCap } from "./warmup";
import {
  assembleWidget,
  dayRange,
  type CampaignInput,
  type SendQueueInput,
  type WidgetResponse,
} from "./widgetQueues";

interface CampaignRow extends Omit<CampaignInput, "sentOnDate"> {
  sentToday?: number;
  dayStamp?: string;
  firstSendAt?: string | null;
}

interface QueueRow {
  status: SendQueueInput["status"];
  accounts: SendQueueInput["accounts"];
}

let ready: Promise<void> | null = null;

/** A „melyik queue szól erre a napra” kérdés indexe. */
async function sendQueues() {
  const collection = (await getDb()).collection<QueueRow>("send_queues");
  ready ??= collection
    .createIndex({ runDate: 1 })
    .then(() => undefined)
    .catch(() => {
      ready = null;
    });
  await ready;
  return collection;
}

export async function widgetQueues(
  date: string | null,
  now = new Date(),
): Promise<WidgetResponse> {
  const today = dayKey(now);
  const day = date ?? today;
  const range = dayRange(day);
  // A menet a napot a gép saját naptárával bélyegzi (`toDateString`).
  const stamp = new Date(`${day}T12:00:00Z`).toDateString();

  const db = await getDb();
  const contacts = await getContacts();
  const [, sent, campaigns, queues, stats] = await Promise.all([
    ensureAccounts(),
    // A napon kiment első levelek fiókonként — a `sent_at` részindexen fut.
    contacts
      .aggregate<{ _id: string | null; count: number; lastAt: string }>([
        {
          $match: {
            sent: true,
            sentAt: { $gte: range.start, $lt: range.end },
          },
        },
        {
          $group: {
            _id: "$sentFrom",
            count: { $sum: 1 },
            lastAt: { $max: "$sentAt" },
          },
        },
      ])
      .toArray(),
    // Fiókonként egy kis sor; a várakozók listája helyett csak a hossza jön.
    db
      .collection("campaigns")
      .aggregate<CampaignRow>([
        {
          $project: {
            _id: 0,
            accountId: 1,
            status: 1,
            stopRequested: { $eq: ["$stopRequested", true] },
            queueLength: { $size: { $ifNull: ["$queue", []] } },
            queueId: { $ifNull: ["$options.queueId", null] },
            dailyLimit: { $ifNull: ["$options.dailyLimit", null] },
            sentToday: 1,
            dayStamp: 1,
            firstSendAt: 1,
            nextAt: { $ifNull: ["$nextAt", null] },
            updatedAt: { $ifNull: ["$updatedAt", null] },
          },
        },
      ])
      .toArray(),
    (await sendQueues())
      .find({ runDate: day } as never, {
        projection: { status: 1, accounts: 1 },
      })
      .toArray(),
    (await queueStats())
      .find({ date: day }, { projection: { _id: 0, date: 0 } })
      .toArray(),
  ]);

  // A még be nem töltött queue-kban hányan kaphatnak levelet — egy összesítés,
  // az `in_queue` részindexen; a címzettlistákat nem húzzuk át.
  const unloaded = queues
    .filter(
      (queue) => queue.status === "varakozik" || queue.status === "leallitva",
    )
    .map((queue) => queue._id.toString());
  const open = unloaded.length
    ? await contacts
        .aggregate<{ _id: string; count: number }>([
          {
            $match: {
              // A `$type` kell: ettől látja a tervező, hogy a részindex elég.
              queueId: { $in: unloaded, $type: "string" },
              sent: false,
              primaryEmail: { $ne: null },
              outcome: null,
            },
          },
          { $group: { _id: "$queueId", count: { $sum: 1 } } },
        ])
        .toArray()
    : [];
  const openBy = new Map(open.map((row) => [row._id, row.count]));
  const firstSend = new Map(
    campaigns.map((row) => [row.accountId, row.firstSendAt ?? null]),
  );

  return assembleWidget(
    {
      date: day,
      today,
      accounts: listAccounts().map((account) => ({
        id: account.id,
        name: account.label,
        cap: account.warmup
          ? warmupCap(
              account.warmupStart ?? firstSend.get(account.id),
              account.provider,
              now,
              account.warmupSteps,
            )
          : account.dailyMax,
      })),
      sent: sent
        .filter((row) => row._id)
        .map((row) => ({
          from: row._id as string,
          count: row.count,
          lastAt: row.lastAt,
        })),
      campaigns: campaigns.map((row) => ({
        accountId: row.accountId,
        status: row.status,
        stopRequested: row.stopRequested,
        queueLength: row.queueLength,
        queueId: row.queueId,
        dailyLimit: row.dailyLimit,
        sentOnDate: row.dayStamp === stamp ? (row.sentToday ?? 0) : 0,
        nextAt: row.nextAt,
        updatedAt: row.updatedAt,
      })),
      queues: queues.map((queue) => ({
        id: queue._id.toString(),
        status: queue.status,
        accounts: queue.accounts ?? [],
        open: openBy.get(queue._id.toString()) ?? 0,
      })),
      stats: stats.map((row) => ({
        queueId: row.queueId,
        total: row.total ?? 0,
        done: row.done ?? 0,
        failed: row.failed ?? 0,
        inProgress: row.inProgress ?? 0,
        running: row.running === true,
        lastError: row.lastError ?? null,
        completedAt: row.completedAt ?? null,
        updatedAt: row.updatedAt ?? null,
      })),
    },
    now,
  );
}
