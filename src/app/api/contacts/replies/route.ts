import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { listAccounts } from "@/lib/accounts";
import { countContacts, listContacts } from "@/lib/contacts";
import { latestReplies } from "@/lib/mailStore";
import { sendFollowUpEmail } from "@/lib/mailer";
import { getContacts } from "@/lib/mongodb";
import { triageContacts } from "@/lib/replyTriage";

export const dynamic = "force-dynamic";

/** Új (kezeletlen) válaszok: a levél kivonata, az osztályozás és a piszkozat. */
export async function GET() {
  try {
    const [count, rows] = await Promise.all([
      countContacts({ reply: "new" }),
      listContacts(
        { reply: "new", sort: "updated" },
        { page: 0, pageSize: 100 },
      ),
    ]);
    const replies = await latestReplies(rows.map((row) => row._id));
    const items = rows
      .map((row) => {
        const reply = replies.get(row._id);
        return {
          id: row._id,
          company: row.company,
          outcome: row.outcome ?? null,
          outcomeSource: row.outcomeSource ?? null,
          triage: row.replyTriage ?? null,
          reply: reply
            ? {
                from: reply.from,
                subject: reply.subject,
                date: reply.date,
                excerpt: reply.text.replace(/\n{3,}/g, "\n\n").slice(0, 1200),
                threaded: Boolean(reply.messageId),
              }
            : null,
        };
      })
      .sort((a, b) => (b.reply?.date ?? "").localeCompare(a.reply?.date ?? ""));
    return NextResponse.json({ count, items });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

/**
 * `{ action: "triage", ids, force? }` — (újra)osztályozás
 * `{ action: "send", id, subject, body }` — válasz a szálban, utána kezeltnek jelöl
 * `{ action: "handled", id }` — kezelve, válasz nélkül
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      ids?: string[];
      id?: string;
      subject?: string;
      text?: string;
      force?: boolean;
    };
    const collection = await getContacts();

    if (body.action === "triage") {
      return NextResponse.json(
        await triageContacts(body.ids ?? [], { force: body.force }),
      );
    }

    if (!body.id || !ObjectId.isValid(body.id)) {
      return NextResponse.json({ error: "Hiányzó sor." }, { status: 400 });
    }
    const _id = new ObjectId(body.id);
    const now = new Date().toISOString();

    if (body.action === "handled") {
      await collection.updateOne({ _id }, {
        $set: { replyHandledAt: now },
      } as never);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "send") {
      const text = (body.text ?? "").trim();
      if (!text)
        return NextResponse.json({ error: "Üres válasz." }, { status: 400 });
      if (/\[kitöltendő/i.test(text)) {
        return NextResponse.json(
          {
            error:
              "A piszkozatban maradt [kitöltendő] jelölés — töltsd ki küldés előtt.",
          },
          { status: 400 },
        );
      }
      const contact = await collection.findOne({ _id });
      const reply = (await latestReplies([body.id])).get(body.id);
      if (!contact || !reply?.from) {
        return NextResponse.json(
          { error: "Nincs meg a válasz, amire felelni lehetne." },
          { status: 400 },
        );
      }
      // Arról a címről válaszolunk, amire a levél jött.
      const account =
        listAccounts().find(
          (item) => item.user.toLowerCase() === reply.to.toLowerCase(),
        ) ?? listAccounts()[0];
      const result = await sendFollowUpEmail({
        accountId: account?.id,
        to: reply.from,
        company: contact.company,
        subject: body.subject?.trim() || `Re: ${reply.subject}`,
        body: text,
        inReplyTo: reply.messageId,
        kind: "válasz",
      });
      await collection.updateOne({ _id }, {
        $set: { replyHandledAt: now, updatedAt: now },
        $addToSet: { tags: "valaszoltam" },
      } as never);
      return NextResponse.json({
        ok: true,
        messageId: result.messageId,
        account: result.account,
      });
    }

    return NextResponse.json({ error: "Ismeretlen művelet." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
