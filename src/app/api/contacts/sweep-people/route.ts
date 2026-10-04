import { NextRequest, NextResponse } from "next/server";
import { filtersFromParams } from "@/app/api/contacts/route";
import {
  peopleSweepState,
  startPeopleSweep,
  stopPeopleSweep,
} from "@/lib/peopleSweep";
import type { SearchProvider } from "@/lib/emailFinder";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("api:emberek");

/** A futó kapcsolattartó-begyűjtés állapota. */
export async function GET() {
  return NextResponse.json(peopleSweepState());
}

/** `{ action: "start" | "stop" }` — a begyűjtés a szerveren fut tovább. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      provider?: string;
      limit?: number;
      skipSearched?: boolean;
      delayMs?: number;
      /** Egyszerre hány cégen dolgozzon (1-8). */
      concurrency?: number;
      ids?: string[];
      filters?: Record<string, string>;
    };

    if (body.action === "stop") return NextResponse.json(stopPeopleSweep());

    const provider = (["openai", "claude", "codex"] as const).includes(
      body.provider as SearchProvider,
    )
      ? (body.provider as SearchProvider)
      : "claude";

    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string")
      : [];

    const filters = body.filters
      ? filtersFromParams(new URLSearchParams(body.filters))
      : undefined;

    const state = startPeopleSweep({
      provider,
      limit: Math.max(0, Math.min(5000, Number(body.limit ?? 25))),
      concurrency: Math.max(1, Math.min(8, Number(body.concurrency ?? 1) || 1)),
      skipSearched: body.skipSearched !== false,
      delayMs: Math.max(0, Math.min(60_000, Number(body.delayMs ?? 1500))),
      ...(ids.length ? { ids } : {}),
      ...(filters ? { filters } : {}),
    });

    log.info(
      `indítás: ${ids.length ? `${ids.length} kijelölt` : "szűrt lista"} (${provider})`,
    );
    return NextResponse.json(state);
  } catch (error) {
    log.error("hiba", (error as Error).message);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
