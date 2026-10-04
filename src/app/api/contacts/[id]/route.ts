import { NextRequest, NextResponse } from "next/server";
import { deleteContact, resetContact, updateContact } from "@/lib/contacts";
import { allSeedContacts } from "@/data";

export const dynamic = "force-dynamic";

/** Restore one contact to the text parsed from the PDF. */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const current = await updateContact(id, {});
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const original = allSeedContacts().find(
      (contact) => contact.key === current.key,
    );
    if (!original) {
      return NextResponse.json(
        { error: "Ehhez a sorhoz nincs eredeti PDF-változat." },
        { status: 400 },
      );
    }

    await resetContact(id);
    const restored = await updateContact(id, {
      company: original.company,
      person: original.person,
      role: original.role,
      primaryEmail: original.primaryEmail,
      emails: original.emails,
      note: original.note,
      emailSubject: original.emailSubject,
      emailBody: original.emailBody,
      linkedinMessage: original.linkedinMessage,
      connectionRequest: original.connectionRequest,
    });
    await resetContact(id);

    return NextResponse.json({ contact: { ...restored, manualFields: [] } });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const patch = (await request.json()) as Record<string, unknown>;
    // A kliens megjelölheti, honnan jött — a változásnapló ezt mutatja.
    const source =
      typeof patch.__source === "string" ? patch.__source : "kézi szerkesztés";
    delete patch.__source;
    const updated = await updateContact(id, patch, source);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ contact: updated });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const ok = await deleteContact(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
