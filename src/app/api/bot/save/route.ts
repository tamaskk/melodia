import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { saveBotResult } from "@/lib/botApi";

export const dynamic = "force-dynamic";

/**
 * A külső kutatóbot eredményének mentése: `{ id, email, source, people, … }`.
 * Az `id` a /api/bot/next válaszából a `contact._id`. Kulcs nem kell.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "A body JSON objektum legyen: { id, email, source, … }." },
        { status: 400 },
      );
    }
    if (typeof body.id !== "string" || !ObjectId.isValid(body.id)) {
      return NextResponse.json(
        { error: "Hiányzik vagy hibás az id. A /api/bot/next válaszából a contact._id kell." },
        { status: 400 },
      );
    }

    const result = await saveBotResult(body.id, body);
    if (!result) {
      return NextResponse.json({ error: "Nincs ilyen sor." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
