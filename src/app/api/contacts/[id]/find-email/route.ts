import { NextRequest, NextResponse } from "next/server";
import { getContactById, saveEmailSearch } from "@/lib/contacts";
import { findEmail, searchProvider, type SearchProvider } from "@/lib/emailFinder";
import { createLogger, requestId } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Megkeresi a cég publikus e-mail címét a weben. Semmit nem ír az adatbázisba —
 * a találatot a felhasználó fogadja el a panelen.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const log = createLogger(`api:find-email#${requestId()}`);
  try {
    const body = (await request.json().catch(() => ({}))) as { provider?: string };
    const provider: SearchProvider =
      ["claude", "openai", "codex"].includes(String(body.provider))
        ? (body.provider as SearchProvider)
        : searchProvider();

    const contact = await getContactById(id);
    if (!contact) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const finding = await findEmail(contact, provider);

    // Mindent eltárolunk, ami visszajött — a további címeket és az űrlap
    // linkjét is —, hogy egy későbbi megnyitáskor is meglegyen.
    const record = {
      at: new Date().toISOString(),
      result: (finding.email ? "found" : "none") as "found" | "none",
      email: finding.email,
      confidence: finding.confidence,
      source: finding.source,
      applyUrl: finding.applyUrl,
      alternatives: finding.alternatives,
      notes: finding.notes,
      citations: finding.citations,
      model: finding.model,
    };
    await saveEmailSearch(id, record);

    log.info(
      `mentve: ${contact.company} → ${finding.email ?? "nincs cím"}`,
      { confidence: finding.confidence, model: finding.model },
    );

    return NextResponse.json({ ...finding, record });
  } catch (error) {
    log.error("elszállt", (error as Error).message);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
