import { NextRequest, NextResponse } from "next/server";
import { listUsage, usageSummary } from "@/lib/usage";

export const dynamic = "force-dynamic";

/**
 * Token-felhasználás.
 *
 * - `?days=30` vagy `?from=2026-09-01&to=2026-09-06` — összesítés a felületnek
 * - `&entries=1` — az időszak **összes** tétele, korlát nélkül (exporthoz)
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const range = {
      ...(params.get("from") ? { from: params.get("from") as string } : {}),
      ...(params.get("to") ? { to: params.get("to") as string } : {}),
      ...(params.get("days") ? { days: Number(params.get("days")) } : {}),
    };

    if (params.get("entries") === "1") {
      const entries = await listUsage(range);
      return NextResponse.json({ entries, total: entries.length });
    }

    return NextResponse.json(await usageSummary(range));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
