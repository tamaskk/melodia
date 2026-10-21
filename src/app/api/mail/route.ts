import { NextRequest, NextResponse } from "next/server";
import {
  THREAD_STATUSES,
  dailyCounts,
  listThreads,
  setThreadMarks,
  threadMessages,
  type ThreadStatus,
} from "@/lib/mailStore";
import { ensureAccounts, publicAccounts } from "@/lib/accounts";
import { isInboxReady } from "@/lib/inbox";
import { threadReplyStatuses } from "@/lib/threadReplies";
import { draftThreadIds } from "@/lib/autoDrafts";

export const dynamic = "force-dynamic";

/**
 * Szálak listája (`?status=valasz-var&q=nova`), egyetlen nap levelei
 * (`?day=2026-10-10`), csak az elutasítások (`?rejected=1`), vagy egy szál
 * teljes levelezése (`?threadId=...`).
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const threadId = params.get("threadId");

    if (threadId) {
      return NextResponse.json({ messages: await threadMessages(threadId) });
    }

    const rejected = params.get("rejected") === "1";
    const account = params.get("account")?.trim() || undefined;
    const day = params.get("day") ?? "";
    // `piszkozat`: nem állapot, hanem a kész Gmail-piszkozatos szálak.
    const status = params.get("status") ?? "";
    const drafts = status === "piszkozat";
    await ensureAccounts();
    const [{ threads, stats }, daily, scheduled] = await Promise.all([
      listThreads({
        q: params.get("q") ?? "",
        status: drafts ? "" : (status as ThreadStatus | ""),
        threadIds: drafts ? await draftThreadIds() : undefined,
        rejected,
        account,
        day: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined,
        limit: Number(params.get("limit") ?? 500),
      }),
      // Az elutasítások oldalán nincs diagram — kár lekérdezni.
      rejected
        ? []
        : dailyCounts(
            Math.max(7, Math.min(90, Number(params.get("days") ?? 30))),
            account,
          ),
      // Melyik szálra van már időzített vagy kiment válasz — a jelvényhez.
      threadReplyStatuses(),
    ]);
    return NextResponse.json({
      threads,
      stats,
      daily,
      scheduled,
      accounts: publicAccounts(),
      ready: isInboxReady(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

/**
 * Kézi állapot szálakra: `{ threadIds, status }` (vagy egy `threadId`) —
 * `status: null` visszaadja a számoltat. Új emberi válasz után a kézi állapot
 * magától lejár.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      threadId?: unknown;
      threadIds?: unknown;
      status?: unknown;
    };
    const threadIds = [
      ...(Array.isArray(body.threadIds) ? body.threadIds : []),
      body.threadId,
    ].filter((id): id is string => typeof id === "string" && !!id);
    const status =
      body.status === null
        ? null
        : THREAD_STATUSES.find((item) => item === body.status);
    if (!threadIds.length || threadIds.length > 500 || status === undefined) {
      return NextResponse.json(
        {
          error:
            "Adj meg 1–500 szálat és egy ismert állapotot (vagy null-t a visszaállításhoz).",
        },
        { status: 400 },
      );
    }
    await setThreadMarks([...new Set(threadIds)], status);
    return NextResponse.json({ ok: true, marked: threadIds.length });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
