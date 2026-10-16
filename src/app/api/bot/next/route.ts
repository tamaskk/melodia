import { NextRequest, NextResponse } from "next/server";
import { claimNext, MAX_LEASE_MINUTES } from "@/lib/botApi";
import { filtersFromParams } from "../../contacts/route";

export const dynamic = "force-dynamic";

/**
 * Egy cég a külső kutatóbotnak: nincs e-mail címe, és még nem is kerestünk
 * hozzá. A kiadott cég le van foglalva (`botStatus: "in-progress"`), így a
 * párhuzamosan futó botok mind más céget kapnak. A foglalás a mentésig
 * (/api/bot/save) vagy a lejáratig él: `lease` perc (alap 30), a `bot`
 * paraméter a foglaló neve a naplóhoz. A szűrők ugyanazok, mint a /api/contacts-nál — query-ben vagy JSON
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

    const lease = params.has("lease") ? Number(params.get("lease")) : undefined;
    if (
      lease !== undefined &&
      (!Number.isInteger(lease) || lease < 1 || lease > MAX_LEASE_MINUTES)
    ) {
      return NextResponse.json(
        { error: `A lease 1 és ${MAX_LEASE_MINUTES} közötti egész (perc) legyen.` },
        { status: 400 },
      );
    }
    const bot = params.get("bot")?.trim().slice(0, 60) || null;

    return NextResponse.json(
      await claimNext(filtersFromParams(params), {
        skip,
        leaseMinutes: lease,
        bot,
      }),
    );
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
