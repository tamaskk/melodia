import { NextRequest, NextResponse } from "next/server";
import { ensureAccounts, getAccount, publicAccounts } from "@/lib/accounts";
import { sendFollowUpEmail } from "@/lib/mailer";

export const dynamic = "force-dynamic";

/** Egy cím: valami@valami.tld — a pontos ellenőrzést a szolgáltató végzi. */
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** A küldő fiókok a választóhoz, jelszó nélkül. */
export async function GET() {
  try {
    await ensureAccounts();
    return NextResponse.json({ accounts: publicAccounts() });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

/**
 * Egyéni levél egy kiválasztott fiókból: `{ accountId, to, subject, text }`.
 * Nem kötődik kontakthoz és queue-hoz, csatolmány nélkül, sima szövegként megy.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      accountId?: unknown;
      to?: unknown;
      subject?: unknown;
      text?: unknown;
    } | null;
    const accountId =
      typeof body?.accountId === "string" ? body.accountId.trim() : "";
    const to = typeof body?.to === "string" ? body.to.trim() : "";
    const subject =
      typeof body?.subject === "string" ? body.subject.trim() : "";
    const text = typeof body?.text === "string" ? body.text.trim() : "";

    if (!accountId) {
      return NextResponse.json(
        { error: "Válaszd ki, melyik fiókból menjen a levél." },
        { status: 400 },
      );
    }
    if (!EMAIL.test(to)) {
      return NextResponse.json(
        { error: "Adj meg egy érvényes címzettet (egy e-mail cím)." },
        { status: 400 },
      );
    }
    if (!subject || !text) {
      return NextResponse.json(
        { error: "A tárgy és a levél szövege sem lehet üres." },
        { status: 400 },
      );
    }

    await ensureAccounts();
    // Azonosító nélkül a getAccount az első fiókot adná — itt nem találgatunk.
    const account = getAccount(accountId);
    if (!account) {
      return NextResponse.json(
        {
          error:
            "Ez a küldő fiók nincs meg (vagy a jelszava nem használható) — nézd meg a Küldő fiókok oldalon.",
        },
        { status: 400 },
      );
    }

    const result = await sendFollowUpEmail({
      accountId: account.id,
      to,
      company: to,
      subject,
      body: text,
      kind: "egyéni levél",
    });
    return NextResponse.json({
      ok: true,
      account: result.account,
      messageId: result.messageId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
