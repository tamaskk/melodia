import { NextRequest, NextResponse } from "next/server";
import { nextUnsearched } from "@/lib/botApi";
import { filtersFromParams } from "../../contacts/route";

export const dynamic = "force-dynamic";

/**
 * Egy cég a külső kutatóbotnak: nincs e-mail címe, és még nem is kerestünk
 * hozzá. A szűrők ugyanazok, mint a /api/contacts-nál — query-ben vagy JSON
 * body-ban (a body nyer). Kulcs nem kell.
 *
 * GET kérés body-ját a Next nem adja át: GET-nél a szűrő query-ben megy,
 * body-hoz POST kell.
 */
async function handle(request: NextRequest) {
  try {
    const params = new URLSearchParams(request.nextUrl.searchParams);

    const text = await request.text().catch(() => "");
    if (text.trim()) {
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { error: "A body nem érvényes JSON. Küldj objektumot, pl. {\"country\":\"HU\"}." },
          { status: 400 },
        );
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json(
          { error: "A body JSON objektum legyen a szűrőkkel." },
          { status: 400 },
        );
      }
      for (const [name, value] of Object.entries(body)) {
        if (typeof value === "string" || typeof value === "number") {
          params.set(name, String(value));
        }
      }
    }

    const skip = Number(params.get("skip") ?? 0);
    if (!Number.isInteger(skip) || skip < 0) {
      return NextResponse.json(
        { error: "A skip nemnegatív egész szám legyen." },
        { status: 400 },
      );
    }

    return NextResponse.json(await nextUnsearched(filtersFromParams(params), skip));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export function GET(request: NextRequest) {
  return handle(request);
}

/** Ugyanaz, mint a GET, csak a szűrők JSON body-ban jönnek. */
export function POST(request: NextRequest) {
  return handle(request);
}
