import { NextRequest, NextResponse } from "next/server";
import {
  dailyCounts,
  listThreads,
  threadMessages,
  type ThreadStatus,
} from "@/lib/mailStore";
import { isInboxReady } from "@/lib/inbox";

export const dynamic = "force-dynamic";

/**
 * Szálak listája (`?status=valasz-var&q=nova`), vagy egy szál teljes
 * levelezése (`?threadId=...`).
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const threadId = params.get("threadId");

    if (threadId) {
      return NextResponse.json({ messages: await threadMessages(threadId) });
    }

    const [{ threads, stats }, daily] = await Promise.all([
      listThreads({
        q: params.get("q") ?? "",
        status: (params.get("status") ?? "") as ThreadStatus | "",
        limit: Number(params.get("limit") ?? 500),
      }),
      dailyCounts(Math.max(7, Math.min(90, Number(params.get("days") ?? 30)))),
    ]);
    return NextResponse.json({ threads, stats, daily, ready: isInboxReady() });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
