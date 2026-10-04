import { NextRequest, NextResponse } from "next/server";
import { isInboxReady, startAutoSync, startSync, syncState } from "@/lib/inbox";

export const dynamic = "force-dynamic";

/** A begyűjtés állapota — a felület ezt kérdezi le futás közben. */
export async function GET() {
  // Az ütemező a szerverindításkor indul (instrumentation); ha az a futó
  // szervernél kimaradt (pl. frissítés újraindítás nélkül), itt bekapcsol.
  // Idempotens: egy közös időzítő van.
  startAutoSync();
  return NextResponse.json({ ...syncState(), ready: isInboxReady() });
}

/** Begyűjtés indítása: `{ days?: number }`. */
export async function POST(request: NextRequest) {
  try {
    if (!isInboxReady()) {
      return NextResponse.json(
        {
          error:
            "Nincs Gmail-hozzáférés. Az atlas-credentials.env-be kell a GMAIL_USER és " +
            "a GMAIL_APP_PASSWORD (ugyanaz, amivel küldünk).",
        },
        { status: 400 },
      );
    }
    const body = (await request.json().catch(() => ({}))) as { days?: number };
    const days = Number.isFinite(body.days) ? Number(body.days) : undefined;
    return NextResponse.json(startSync(days));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
