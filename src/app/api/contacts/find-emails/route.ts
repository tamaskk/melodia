import { NextRequest, NextResponse } from "next/server";
import { searchProvider, type SearchProvider } from "@/lib/emailFinder";
import { startSweep, sweepState } from "@/lib/emailSweep";
import { createLogger, requestId } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * A kijelölt cégekhez keres e-mailt — **egyesével**, ugyanazzal a motorral,
 * mint az automata begyűjtés. A kérés azonnal visszatér, a futás a szerveren
 * megy tovább; a haladás a /api/contacts/sweep-emails állapotán és a naplóban
 * követhető, és a "Leállítás" gombbal megszakítható.
 */
export async function POST(request: NextRequest) {
  const log = createLogger(`api:find-emails#${requestId()}`);
  try {
    const body = (await request.json()) as {
      ids?: unknown;
      provider?: string;
      delayMs?: number;
    };

    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string")
      : [];
    if (!ids.length) {
      return NextResponse.json({ error: "Nincs kijelölt sor." }, { status: 400 });
    }

    const provider: SearchProvider = ["claude", "openai", "codex"].includes(
      String(body.provider),
    )
      ? (body.provider as SearchProvider)
      : searchProvider();

    const current = sweepState();
    if (current.status === "running" || current.status === "stopping") {
      return NextResponse.json(
        {
          error:
            `Már fut egy keresés (${current.processed}/${current.total}). ` +
            "Várd meg, vagy állítsd le a fenti dobozban.",
        },
        { status: 409 },
      );
    }

    log.info(`${ids.length} kijelölt cég, egyesével, motor: ${provider}`);

    const state = startSweep({
      provider,
      ids,
      limit: 0,
      skipSearched: false,
      delayMs: Math.max(0, Math.min(60000, Number(body.delayMs ?? 3000))),
    });

    return NextResponse.json({ started: true, ...state });
  } catch (error) {
    log.error("elszállt", (error as Error).message);
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
