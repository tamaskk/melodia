import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { countContacts, listContacts } from "@/lib/contacts";
import { followUpDraft } from "@/lib/followup";
import { originalOutgoing } from "@/lib/mailStore";
import { getContacts } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

/**
 * Esedékes follow-upok a piszkozattal együtt, a legrégebben kiküldöttel
 * kezdve. `threaded` = megvan az eredeti levél azonosítója, tehát a válasz a
 * címzettnél ugyanabban a szálban jelenik meg.
 */
export async function GET(request: NextRequest) {
  try {
    const limit = Math.min(
      200,
      Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 100)),
    );
    const [due, approved, rows] = await Promise.all([
      countContacts({ followUp: "due" }),
      countContacts({ followUp: "approved" }),
      listContacts(
        { followUp: "due", sort: "sent-oldest" },
        { page: 0, pageSize: limit },
      ),
    ]);
    const originals = await originalOutgoing(rows.map((row) => row._id));
    const items = rows.map((row) => {
      const original = originals.get(row._id);
      const draft = followUpDraft(row, original?.subject);
      return {
        id: row._id,
        company: row.company,
        email: row.primaryEmail,
        sentAt: row.sentAt,
        from: original?.from || row.sentFrom || null,
        approved: Boolean(row.followUpApprovedAt),
        threaded: Boolean(original?.messageId || row.sentMessageId),
        subject: draft.subject,
        body: draft.body,
      };
    });
    return NextResponse.json({ due, approved, items });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

/** Jóváhagyás / visszavonás: `{ action: "approve" | "unapprove", ids }`. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      ids?: string[];
    };
    const ids = (body.ids ?? [])
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    if (!ids.length)
      return NextResponse.json(
        { error: "Nincs kijelölt sor." },
        { status: 400 },
      );
    const collection = await getContacts();
    const result = await collection.updateMany({ _id: { $in: ids } }, {
      $set: {
        followUpApprovedAt:
          body.action === "unapprove" ? null : new Date().toISOString(),
      },
    } as never);
    return NextResponse.json({ updated: result.modifiedCount });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
