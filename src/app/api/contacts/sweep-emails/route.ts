import { NextRequest, NextResponse } from "next/server";
import { searchProvider, type SearchProvider } from "@/lib/emailFinder";
import { startSweep, stopSweep, sweepState } from "@/lib/emailSweep";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("api:sweep");

/** Az aktuális állapot — a felület ezt kérdezi le pár másodpercenként. */
export async function GET() {
  return NextResponse.json(sweepState());
}

/**
 * `{ action: "start" | "stop" }`. Indításkor a futás a kérés lezárása után is
 * megy tovább a szerver folyamatában; a haladás a GET-en és a naplóban látszik.
 */
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
      /** A felületen aktív szűrő — ilyenkor csak azt a halmazt visszük végig. */
      filters?: Record<string, string>;
    };

    if (body.action === "stop") {
      log.info("leállítás kérés");
      return NextResponse.json(stopSweep());
    }

    const provider: SearchProvider = ["claude", "openai", "codex"].includes(
      String(body.provider),
    )
      ? (body.provider as SearchProvider)
      : searchProvider();

    const state = startSweep({
      provider,
      ...(body.filters && Object.keys(body.filters).length
        ? { filters: body.filters as never }
        : {}),
      limit: Math.max(0, Math.min(5000, Number(body.limit ?? 0))),
      concurrency: Math.max(1, Math.min(8, Number(body.concurrency ?? 1) || 1)),
      skipSearched: body.skipSearched !== false,
      delayMs: Math.max(0, Math.min(60000, Number(body.delayMs ?? 3000))),
    });

    log.info(`indítás kérés (${provider})`, {
      limit: body.limit ?? 0,
      skipSearched: body.skipSearched !== false,
    });

    return NextResponse.json(state);
  } catch (error) {
    log.error("hiba", (error as Error).message);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
