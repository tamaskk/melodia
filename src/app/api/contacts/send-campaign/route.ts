import { credential } from "@/lib/env";
import { NextRequest, NextResponse } from "next/server";
import {
  allCampaignStates,
  previewQueue,
  sendSelfTest,
  startCampaign,
  stopCampaign,
} from "@/lib/sendCampaign";
import { ensureAccounts, publicAccounts } from "@/lib/accounts";
import { attachmentsDir, listAttachments } from "@/lib/attachments";
import { isMailerReady, verifyMailer } from "@/lib/mailer";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("api:kuldes");

export async function GET() {
  await ensureAccounts();
  const [hu, en] = await Promise.all([
    listAttachments("hu"),
    listAttachments("en"),
  ]);
  return NextResponse.json({
    // Fiókonként egy állapot: ebből látszik, melyik fut és hol tart.
    accounts: publicAccounts(),
    campaigns: allCampaignStates(),
    configured: isMailerReady(),
    // Csatolmány helyett CV-link: csak ha van nyilvános CV-URL beállítva.
    cvUrl: Boolean(credential("CV_URL")),
    attachments: {
      dir: attachmentsDir(),
      // Egy lista minden fájlról; a "scope" mondja meg, kinek mehet.
      files: [
        ...hu.files.map((file) => ({
          key: file.key ?? file.filename,
          name: file.filename,
          bytes: file.bytes,
          scope: file.scope,
        })),
        ...en.files
          .filter((file) => file.scope === "en")
          .map((file) => ({
            key: file.key ?? `en/${file.filename}`,
            name: file.filename,
            bytes: file.bytes,
            scope: file.scope,
          })),
      ],
      warning: hu.warning ?? en.warning,
    },
  });
}

/**
 * `{ action: "start" | "stop" | "test" | "self-test" | "preview", accountId }`.
 * Indításkor a küldés a kérés lezárása után is fut tovább — az oldal
 * frissítése nem szakítja meg, és a szerver újraindulása után is folytatódik.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureAccounts();
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      accountId?: string;
      ids?: string[];
      filters?: Record<string, string>;
      dailyLimit?: number;
      minMinutes?: number;
      maxMinutes?: number;
      windowFrom?: number;
      windowTo?: number;
      ignoreWindow?: boolean;
      testMode?: boolean;
      attachments?: string[];
      allowSameDomain?: boolean;
      mode?: string;
      cvLink?: boolean;
    };

    const accountId =
      typeof body.accountId === "string" ? body.accountId : undefined;

    if (body.action === "stop") {
      const state = stopCampaign(accountId);
      return state
        ? NextResponse.json(state)
        : NextResponse.json({ error: "Nincs ilyen fiók." }, { status: 400 });
    }

    if (body.action === "test") {
      // Csak kapcsolat- és jelszóellenőrzés, levél nem megy ki.
      return NextResponse.json(await verifyMailer(accountId));
    }

    if (body.action === "preview") {
      // Mit küldenénk ki: címzettek, tárgy, szöveg, csatolmányok. Nem küld semmit.
      return NextResponse.json(
        await previewQueue({
          ...(Array.isArray(body.ids) && body.ids.length
            ? { ids: body.ids }
            : {}),
          ...(body.filters && Object.keys(body.filters).length
            ? { filters: body.filters as never }
            : {}),
          limit: Math.max(1, Math.min(100, Number(body.dailyLimit ?? 18))),
          ...(Array.isArray(body.attachments)
            ? { attachments: body.attachments }
            : {}),
          allowSameDomain: body.allowSameDomain === true,
        }),
      );
    }

    if (body.action === "self-test") {
      // Próbalevél SAJÁT MAGADNAK: pontosan úgy néz ki, mint az éles levél
      // (tárgy, szöveg, csatolmányok), de cégnek nem megy ki, és semmit nem jelöl.
      return NextResponse.json(
        await sendSelfTest(
          String(body.ids?.[0] ?? ""),
          body.attachments,
          accountId,
        ),
      );
    }

    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string")
      : [];

    const minMinutes = Math.max(
      1,
      Math.min(120, Number(body.minMinutes ?? 10)),
    );
    const maxMinutes = Math.max(
      minMinutes,
      Math.min(240, Number(body.maxMinutes ?? 20)),
    );

    const result = await startCampaign({
      ...(accountId ? { accountId } : {}),
      ...(ids.length ? { ids } : {}),
      ...(body.filters && Object.keys(body.filters).length
        ? { filters: body.filters as never }
        : {}),
      dailyLimit: Math.max(1, Math.min(100, Number(body.dailyLimit ?? 18))),
      minMinutes,
      maxMinutes,
      windowFrom: Math.max(0, Math.min(23, Number(body.windowFrom ?? 9))),
      windowTo: Math.max(1, Math.min(24, Number(body.windowTo ?? 17))),
      ignoreWindow: body.ignoreWindow === true,
      testMode: body.testMode === true,
      ...(Array.isArray(body.attachments)
        ? { attachments: body.attachments }
        : {}),
      allowSameDomain: body.allowSameDomain === true,
      mode: body.mode === "followup" ? "followup" : "initial",
      cvLink: body.cvLink === true,
    });

    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }

    log.info(
      `indítás (${result.accountUser}): ${ids.length ? `${ids.length} kijelölt` : "szűrt lista"}, ` +
        `napi ${result.dailyLimit}, ${minMinutes}-${maxMinutes} perc`,
    );

    return NextResponse.json(result);
  } catch (error) {
    log.error("hiba", (error as Error).message);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
