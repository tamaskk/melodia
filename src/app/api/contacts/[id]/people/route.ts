import { NextRequest, NextResponse } from "next/server";
import { getContactById, savePeople } from "@/lib/contacts";
import { buildManualPeoplePrompt, parseManualPeople } from "@/lib/peoplePrompt";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("api:emberek");

/** A kézi kutatáshoz való prompt, a cég nevével kitöltve. */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const contact = await getContactById(id);
  if (!contact) {
    return NextResponse.json({ error: "Nincs ilyen sor." }, { status: 404 });
  }
  return NextResponse.json({
    company: contact.company,
    prompt: buildManualPeoplePrompt(contact.company),
  });
}

/**
 * Kézi kutatás eredményének mentése: `{ paste: "...JSON..." }`.
 *
 * A meglévő embereket nem dobjuk el — a `savePeople` névre egyesít.
 */
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

    const body = (await request.json().catch(() => ({}))) as { paste?: unknown };
    if (typeof body.paste !== "string" || !body.paste.trim()) {
      return NextResponse.json(
        { error: "Illeszd be a másik eszköz válaszát (JSON)." },
        { status: 400 },
      );
    }

    const result = parseManualPeople(body.paste, contact.company);
    const people = await savePeople(
      id,
      result.people,
      `Kézi kutatás: ${result.people.length} fő.`,
    );

    log.info(`kézi kapcsolattartók: ${contact.company} — ${result.people.length} fő`, {
      kihagyva: result.skipped.length,
    });

    return NextResponse.json({
      people,
      added: result.people.length,
      skipped: result.skipped,
      companyMismatch: result.companyMismatch,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
