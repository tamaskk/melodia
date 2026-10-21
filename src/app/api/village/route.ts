import { NextRequest, NextResponse } from "next/server";
import { ensureAccounts, getAccount, listAccounts } from "@/lib/accounts";
import {
  autoDraftsToday,
  setAutoDraftsPaused,
  triggerAutoDrafts,
} from "@/lib/autoDrafts";
import { inboxToday } from "@/lib/mailStore";
import { repliesToday } from "@/lib/threadReplies";
import { campaignToday, villageSenders } from "@/lib/sendCampaign";

export const dynamic = "force-dynamic";

/** A mai nap kezdete a szerver órája szerint. */
function startOfToday(): Date {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return day;
}

/**
 * A falu-nézetnek, fiókonként a három háztípus munkája: kiküldés (mikor megy
 * a következő), lekérés (ma beérkezett levelek), válasz (függő és kiment
 * válaszok). `?accountId=&kind=` esetén egy fiók mai részletei az adott típusra.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureAccounts();
    const accountId = request.nextUrl.searchParams.get("accountId");
    const since = startOfToday();
    if (accountId !== null) {
      const account = getAccount(accountId);
      const kind = request.nextUrl.searchParams.get("kind");
      if (kind === "storage") {
        return NextResponse.json(await autoDraftsToday());
      }
      if (account && kind === "fetch") {
        return NextResponse.json(await inboxToday(account.user, since));
      }
      if (account && kind === "reply") {
        const [answers, auto] = await Promise.all([
          repliesToday(account.id, since),
          autoDraftsToday(),
        ]);
        return NextResponse.json({
          ...answers,
          drafts: auto.drafts.filter((draft) => draft.accountId === account.id),
        });
      }
      const today = await campaignToday(accountId);
      return today
        ? NextResponse.json(today)
        : NextResponse.json(
            { error: "Nincs ilyen küldő fiók — frissítsd az oldalt." },
            { status: 404 },
          );
    }
    const accounts = listAccounts();
    const [senders, inboxes, answers, auto] = await Promise.all([
      villageSenders(),
      Promise.all(
        accounts.map((account) => inboxToday(account.user, since, 1)),
      ),
      Promise.all(accounts.map((account) => repliesToday(account.id, since))),
      autoDraftsToday(),
    ]);
    return NextResponse.json({
      paused: auto.paused,
      senders,
      work: accounts.map((account, index) => ({
        id: account.id,
        inboxCount: inboxes[index].count,
        lastInAt: inboxes[index].latestAt,
        repliesWaiting: answers[index].waiting.length,
        repliesSent: answers[index].sent.length,
        lastReplyAt: answers[index].lastSentAt,
        // Az automatikus piszkozatok köre: mikor járt a Lekérő ház, mennyit hozott,
        // és ma hány piszkozat került a Raktárba.
        fetchRunAt: auto.runAt,
        fetchFound: auto.found[account.user.toLowerCase()] ?? 0,
        drafted: auto.drafts.filter(
          (draft) => draft.accountId === account.id && draft.status === "kesz",
        ).length,
        writing:
          auto.drafts.find(
            (draft) =>
              draft.accountId === account.id && draft.status === "iras",
          )?.company ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

/**
 * A Lekérő házra kattintva: lekérés most (a talált levelek számát adja vissza).
 * `{ action: "pause" | "resume" }`: a Lekérő és a Válasz ház leállítása / indítása.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
    };
    if (body.action === "pause" || body.action === "resume") {
      await setAutoDraftsPaused(body.action === "pause");
      return NextResponse.json({ paused: body.action === "pause" });
    }
    return NextResponse.json(await triggerAutoDrafts());
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 409 },
    );
  }
}
