import { NextRequest, NextResponse } from "next/server";
import { askBoolean, isJevReady, JEV_MODEL, JevError } from "@/lib/jev";

export const dynamic = "force-dynamic";

/** Be van-e állítva a gateway-kulcs (az értékét sosem adjuk ki). */
export async function GET() {
  return NextResponse.json({ ready: isJevReady(), model: JEV_MODEL });
}

/** `{ state, question }` → egy igen/nem döntés a Jev modelltől. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    state?: unknown;
    question?: unknown;
  } | null;
  const state = typeof body?.state === "string" ? body.state.trim() : "";
  const question =
    typeof body?.question === "string" ? body.question.trim() : "";
  if (!state || !question) {
    return NextResponse.json(
      { error: "Az állapot és a kérdés is kötelező." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await askBoolean(state, question));
  } catch (error) {
    // A JevError üzenete már emberi mondat, a gateway szó szerinti hibájával.
    const status = error instanceof JevError ? 400 : 500;
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status });
  }
}
