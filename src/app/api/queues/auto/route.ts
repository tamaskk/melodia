import { NextRequest, NextResponse } from "next/server";
import { ensureAccounts } from "@/lib/accounts";
import { availableAttachments } from "@/lib/attachmentIndex";
import {
  applyAutoSchedule,
  leadNames,
  planAutoSchedule,
  scheduleAccounts,
  type AutoScheduleInput,
} from "@/lib/autoSchedule";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Az ütemező panel választói: fiókok és csatolmányok. */
export async function GET() {
  try {
    await ensureAccounts();
    return NextResponse.json({
      accounts: scheduleAccounts(),
      attachments: await availableAttachments(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

/**
 * Automatikus ütemezés.
 * `{ action: "preview", ...beállítások }` → a terv, semmit nem ír
 * `{ action: "apply", ...beállítások }` → újraszámol, és létrehozza a queue-kat
 * `{ action: "leads", ids }` → címzettek neve és címe (legfeljebb 200)
 */
export async function POST(request: NextRequest) {
  try {
    await ensureAccounts();
    const body = (await request
      .json()
      .catch(() => ({}))) as AutoScheduleInput & {
      action?: unknown;
    };
    if (body.action === "preview") {
      return NextResponse.json(await planAutoSchedule(body));
    }
    if (body.action === "apply") {
      return NextResponse.json(await applyAutoSchedule(body));
    }
    if (body.action === "leads") {
      return NextResponse.json({ leads: await leadNames(body.ids) });
    }
    return NextResponse.json(
      { error: "Ismeretlen művelet. Lehet: preview, apply, leads." },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
