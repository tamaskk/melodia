import { NextRequest, NextResponse } from "next/server";
import { availableAttachments } from "@/lib/attachmentIndex";
import { senderStatus } from "@/lib/role";
import {
  MAX_PER_REQUEST,
  approveThreadReplies,
  cancelThreadReplies,
  draftPending,
  editThreadReply,
  listThreadReplies,
  regenerateThreadReply,
  scheduleThreadReplies,
} from "@/lib/threadReplies";

export const dynamic = "force-dynamic";

/** Az időzített válaszok listája, a választható csatolmányok és a küldő gép állapota. */
export async function GET() {
  try {
    const [items, attachments, sender] = await Promise.all([
      listThreadReplies(),
      availableAttachments(),
      senderStatus(),
    ]);
    // Ha maradt megíratlan piszkozat, a háttérben elindul — a válasz nem vár rá.
    if (items.some((item) => item.status === "generalas")) {
      void draftPending().catch(() => undefined);
    }
    return NextResponse.json({ items, attachments, sender });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

function strings(input: unknown): string[] {
  return Array.isArray(input)
    ? input.filter((item): item is string => typeof item === "string" && !!item)
    : [];
}

/**
 * `{ action: "schedule", threadIds, attachments }` — szálak felvétele
 * `{ action: "approve", ids }` — jóváhagyás: a következő szabad helyen kimegy
 * `{ action: "queue", ids }` — a futó cold queue szüneteiben megy, a napi keretbe nem számít
 * `{ action: "send-now", ids }` — jóváhagyás soron kívül: azonnal kimegy, a cold queue mellett
 * `{ action: "edit", id, subject?, body?, attachments? }` — átírás
 * `{ action: "regenerate", id }` — új piszkozat a szál mostani utolsó levelére
 * `{ action: "cancel", ids }` — lemondás
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      threadIds?: unknown;
      ids?: unknown;
      id?: unknown;
      subject?: unknown;
      body?: unknown;
      attachments?: unknown;
    day?: unknown;
    };
    const id = typeof body.id === "string" ? body.id : "";

    if (body.action === "schedule") {
      const threadIds = strings(body.threadIds);
      if (!threadIds.length) {
        return NextResponse.json(
          { error: "Nincs kijelölt szál." },
          { status: 400 },
        );
      }
      if (threadIds.length > MAX_PER_REQUEST) {
        return NextResponse.json(
          { error: `Egyszerre legfeljebb ${MAX_PER_REQUEST} szál időzíthető.` },
          { status: 400 },
        );
      }
      return NextResponse.json(
        await scheduleThreadReplies(threadIds, strings(body.attachments)),
      );
    }
    if (body.action === "approve") {
      return NextResponse.json({
        approved: await approveThreadReplies(strings(body.ids)),
      });
    }
    if (body.action === "queue") {
      const day = typeof body.day === "string" ? body.day : undefined;
      if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return NextResponse.json(
          { error: "A nap formátuma: ÉÉÉÉ-HH-NN." },
          { status: 400 },
        );
      }
      return NextResponse.json({
        approved: await approveThreadReplies(strings(body.ids), "queue", day),
      });
    }
    if (body.action === "send-now") {
      return NextResponse.json({
        approved: await approveThreadReplies(strings(body.ids), "soron-kivul"),
      });
    }
    if (body.action === "cancel") {
      return NextResponse.json({
        cancelled: await cancelThreadReplies(strings(body.ids)),
      });
    }
    if (body.action === "edit") {
      const ok = await editThreadReply(id, {
        subject: typeof body.subject === "string" ? body.subject : undefined,
        body: typeof body.body === "string" ? body.body : undefined,
        attachments: Array.isArray(body.attachments)
          ? strings(body.attachments)
          : undefined,
      });
      return ok
        ? NextResponse.json({ ok: true })
        : NextResponse.json(
            { error: "Ez a levél már nem szerkeszthető." },
            { status: 409 },
          );
    }
    if (body.action === "regenerate") {
      const ok = await regenerateThreadReply(id);
      return ok
        ? NextResponse.json({ ok: true })
        : NextResponse.json(
            { error: "Ez a levél már kiment, vagy nincs meg." },
            { status: 409 },
          );
    }
    return NextResponse.json({ error: "Ismeretlen művelet." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
