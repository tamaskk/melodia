import { NextRequest, NextResponse } from "next/server";
import { historyFacets, listChanges, revertChanges } from "@/lib/history";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("api:naplo");

/** Változáslista szűrőkkel: `?minutes=10&field=done`. */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const minutes = Number(params.get("minutes") ?? 0);
    const [changes, facets] = await Promise.all([
      listChanges({
        ...(minutes > 0
          ? { since: new Date(Date.now() - minutes * 60_000).toISOString() }
          : {}),
        ...(params.get("field") ? { field: params.get("field") as string } : {}),
        ...(params.get("source") ? { source: params.get("source") as string } : {}),
        ...(params.get("contactId")
          ? { contactId: params.get("contactId") as string }
          : {}),
        limit: Number(params.get("limit") ?? 200),
      }),
      historyFacets(),
    ]);
    return NextResponse.json({ changes, facets });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** Visszaállítás: `{ ids: [...] }`. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string")
      : [];
    if (!ids.length) {
      return NextResponse.json(
        { error: "Nincs kiválasztott változás." },
        { status: 400 },
      );
    }
    const result = await revertChanges(ids);
    log.info(`visszaállítás: ${result.reverted} sor`);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
