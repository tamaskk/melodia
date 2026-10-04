import { NextRequest, NextResponse } from "next/server";
import { getContactById } from "@/lib/contacts";
import { generateLetter } from "@/lib/openai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Generates a personalised letter for one contact.
 * Nothing is written to the database — the client decides whether to keep it.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const contact = await getContactById(id);
    if (!contact) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      instruction?: string;
    };

    const generated = await generateLetter(
      contact,
      (body.instruction ?? "").slice(0, 600),
    );

    return NextResponse.json(generated);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
