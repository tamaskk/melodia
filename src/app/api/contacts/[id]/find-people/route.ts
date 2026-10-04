import { NextRequest, NextResponse } from "next/server";
import { getContactById, savePeople } from "@/lib/contacts";
import { findPeople } from "@/lib/peopleFinder";
import type { SearchProvider } from "@/lib/emailFinder";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Egy cég kapcsolattartói: `{ provider }`. Menti is a sorra. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const contact = await getContactById(id);
    if (!contact) {
      return NextResponse.json({ error: "Nincs ilyen sor." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { provider?: string };
    const provider = (["openai", "claude", "codex"] as const).includes(
      body.provider as SearchProvider,
    )
      ? (body.provider as SearchProvider)
      : undefined;

    const finding = await findPeople(contact, provider);
    const people = await savePeople(id, finding.people, finding.notes);

    return NextResponse.json({ people, notes: finding.notes, model: finding.model });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
