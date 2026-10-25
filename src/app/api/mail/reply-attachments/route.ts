import { NextRequest, NextResponse } from "next/server";
import {
  getReplyAttachments,
  replyAttachmentChoices,
  setReplyAttachments,
} from "@/lib/replyAttachments";

export const dynamic = "force-dynamic";

/** A válaszlevelek nyelvenkénti csatolmánya és a választható fájlok. */
export async function GET() {
  try {
    const [value, files] = await Promise.all([
      getReplyAttachments(),
      replyAttachmentChoices(),
    ]);
    return NextResponse.json({ value, files });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

/** `{ hu, en }`: fájlkulcs vagy `null` (csatolmány nélkül). */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const [files, current] = await Promise.all([
      replyAttachmentChoices(),
      getReplyAttachments(),
    ]);
    // A meglévő (akár már hiányzó) választás változatlanul maradhat.
    const pick = (input: unknown, kept: string | null) => {
      if (input === null || input === "") return null;
      if (input === kept) return kept;
      if (
        typeof input !== "string" ||
        !files.some((file) => file.key === input)
      ) {
        throw new Error("Ilyen fájl nincs az attachments mappában.");
      }
      return input;
    };
    const value = {
      hu: pick(body.hu, current.hu),
      en: pick(body.en, current.en),
    };
    await setReplyAttachments(value);
    return NextResponse.json({ value });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
