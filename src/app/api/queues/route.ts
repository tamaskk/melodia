import { NextRequest, NextResponse } from "next/server";
import { ensureAccounts, publicAccounts } from "@/lib/accounts";
import {
  createQueue,
  deleteQueue,
  listQueueNames,
  queueOverview,
  requeueQueue,
  startQueue,
  stopQueue,
} from "@/lib/sendQueues";
import { availableAttachments } from "@/lib/attachmentIndex";
import type { ContactFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Queue-k és naptár. `?brief=1`: csak név és méret (a kiküldő panel
 * választójához) — a teljes válasz számol és előrejelez, az lassabb.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureAccounts();
    if (request.nextUrl.searchParams.get("brief") === "1") {
      return NextResponse.json({
        queues: await listQueueNames(),
        attachments: await availableAttachments(),
      });
    }
    return NextResponse.json({
      ...(await queueOverview()),
      accounts: publicAccounts(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

/**
 * `{ action: "create", name, ids | filters, accounts: [{ accountId, dailyLimit }], minMinutes, maxMinutes, runDate }`
 * `{ action: "start" | "stop" | "requeue", id }`
 */
export async function POST(request: NextRequest) {
  try {
    await ensureAccounts();
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      id?: unknown;
      name?: unknown;
      ids?: unknown;
      filters?: ContactFilters;
      accounts?: unknown;
      minMinutes?: unknown;
      maxMinutes?: unknown;
      runDate?: unknown;
      attachments?: unknown;
    };

    if (body.action === "create") {
      return NextResponse.json(await createQueue(body));
    }
    if (typeof body.id !== "string") {
      return NextResponse.json(
        { error: "Hiányzik a queue azonosítója." },
        { status: 400 },
      );
    }
    if (body.action === "start") {
      return NextResponse.json(await startQueue(body.id));
    }
    if (body.action === "stop") {
      return NextResponse.json(await stopQueue(body.id));
    }
    if (body.action === "requeue") {
      await requeueQueue(body.id);
      return NextResponse.json({
        message: "Visszatéve a sorba — a lokális szerver a következő körben felveszi.",
      });
    }
    return NextResponse.json(
      { error: "Ismeretlen művelet. Lehet: create, start, stop, requeue." },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}

/** Törlés: `{ id }`. A címzettekhez nem nyúl; a queue-ból futó küldést leállítja. */
export async function DELETE(request: NextRequest) {
  try {
    await ensureAccounts();
    const body = (await request.json().catch(() => ({}))) as { id?: unknown };
    if (typeof body.id !== "string" || !(await deleteQueue(body.id))) {
      return NextResponse.json(
        { error: "Nincs ilyen queue." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
