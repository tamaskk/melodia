import { NextRequest, NextResponse } from "next/server";
import { countContacts, getStats } from "@/lib/contacts";
import { TODOS } from "@/lib/todos";
import { startAutoSync } from "@/lib/inbox";
import { filtersFromParams } from "../contacts/route";

export const dynamic = "force-dynamic";

/**
 * Statisztika. Ha a kérés szűrőket is hoz (ugyanazokat, mint a /api/contacts),
 * akkor csak a szűrt halmazra számol — a felület fejléce így azt mutatja, amit
 * épp látsz, nem a teljes adatbázist.
 */
export async function GET(request: NextRequest) {
  try {
    // A „Teendők” sor számai: a teljes adatbázisra, szűrőtől függetlenül.
    if (request.nextUrl.searchParams.get("todos") === "1") {
      // A főoldal betöltése is bekapcsolja az automatikus Gmail-szinkront.
      startAutoSync();
      const counts = await Promise.all(TODOS.map((todo) => countContacts(todo.filters)));
      return NextResponse.json(
        Object.fromEntries(TODOS.map((todo, index) => [todo.key, counts[index]])),
      );
    }
    const filters = filtersFromParams(request.nextUrl.searchParams);
    return NextResponse.json(await getStats(filters));
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
