import { NextRequest, NextResponse } from "next/server";
import { checkCompanies, MAX_NAMES, parseNames } from "@/lib/companyLookup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * `{ names: string[] }` vagy `{ text: "beillesztett szöveg" }` →
 * mely cégek vannak már a listában, és melyek nincsenek.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      names?: unknown;
      text?: unknown;
    };

    const names = Array.isArray(body.names)
      ? body.names.filter((item): item is string => typeof item === "string")
      : typeof body.text === "string"
        ? parseNames(body.text)
        : [];

    if (!names.length) {
      return NextResponse.json(
        { error: "Nem találtam cégnevet a beillesztett szövegben." },
        { status: 400 },
      );
    }

    const result = await checkCompanies(names);
    return NextResponse.json({
      ...result,
      truncated: names.length > MAX_NAMES ? names.length - MAX_NAMES : 0,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
