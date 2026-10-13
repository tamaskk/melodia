import { NextRequest, NextResponse } from "next/server";
import {
  dailyCounts,
  listThreads,
  threadMessages,
  type ThreadStatus,
} from "@/lib/mailStore";
import { ensureAccounts, publicAccounts } from "@/lib/accounts";
import { isInboxReady } from "@/lib/inbox";
import { threadReplyStatuses } from "@/lib/threadReplies";

export const dynamic = "force-dynamic";

/**
 * Szálak listája (`?status=valasz-var&q=nova`), egyetlen nap szálai
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
    await ensureAccounts();
    const [{ threads, stats }, daily, scheduled] = await Promise.all([
      listThreads({
        q: params.get("q") ?? "",
        status: (params.get("status") ?? "") as ThreadStatus | "",
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
