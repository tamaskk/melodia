import { NextRequest, NextResponse } from "next/server";
import {
  draftThreadMail,
  sendThreadMail,
  threadTarget,
} from "@/lib/threadCompose";
import { markDraftSent, threadDraft } from "@/lib/autoDrafts";

export const dynamic = "force-dynamic";
// A piszkozatot a helyi LLM írja, hibánál háromszor próbál — percekig is tarthat.
export const maxDuration = 200;

/**
 * `?threadId=` — honnan és kinek menne a levél ebben a szálban, és a kész
 * Gmail-piszkozat, ha a Válasz ház már megírta.
 */
export async function GET(request: NextRequest) {
  const threadId = request.nextUrl.searchParams.get("threadId") ?? "";
  if (!threadId) {
    return NextResponse.json(
      { error: "Hiányzik a threadId." },
      { status: 400 },
    );
  }
  try {
    const [target, draft] = await Promise.all([
      threadTarget(threadId),
      threadDraft(threadId),
    ]);
    return NextResponse.json({ target, draft });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}

const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

/**
 * `{ action: "draft", threadId, instruction }` — piszkozat a prompt alapján
 * `{ action: "send", threadId, subject, body, attachments, fromDraft }` — azonnal
 * a szálba; `fromDraft`: a Gmail-piszkozat elküldve, törölhető
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const threadId = text(body.threadId).trim();
    if (!threadId) {
      return NextResponse.json(
        { error: "Hiányzik a threadId." },
        { status: 400 },
      );
    }
    if (body.action === "draft") {
      return NextResponse.json({
        draft: await draftThreadMail(threadId, text(body.instruction)),
      });
    }
    if (body.action === "send") {
      const attachments = Array.isArray(body.attachments)
        ? body.attachments.filter(
            (item): item is string => typeof item === "string" && !!item,
          )
        : [];
      const sent = await sendThreadMail(threadId, {
        subject: text(body.subject),
        body: text(body.body),
        attachments,
      });
      if (body.fromDraft === true) await markDraftSent(threadId);
      return NextResponse.json({ ok: true, ...sent });
    }
    return NextResponse.json(
      { error: "Ismeretlen művelet (draft vagy send)." },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
