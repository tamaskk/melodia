import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  MAX_COMPANIES,
  ingestCompanies,
  readCompanies,
} from "@/lib/companyIngest";
import { credential } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A `/api/bot/` előtag belépés nélkül elérhető (`src/proxy.ts`), de ez a
 * végpont ír — ezért saját kulcsot kér: `COMPANY_API_KEY`.
 */
function authorised(request: NextRequest): boolean | null {
  const expected = credential("COMPANY_API_KEY");
  if (!expected) return null;
  const given =
    request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Cégek felvétele egyesével vagy kötegben — leírás: `docs/COMPANY_API.md`.
 * `?dryRun=1` (vagy `"dryRun": true` a törzsben): csak ellenőriz, nem ír.
 */
export async function POST(request: NextRequest) {
  const auth = authorised(request);
  if (auth === null) {
    return NextResponse.json(
      {
        error:
          "Nincs beállítva a COMPANY_API_KEY az atlas-credentials.env fájlban — tedd bele, és indítsd újra a szervert.",
      },
      { status: 503 },
    );
  }
  if (!auth) {
    return NextResponse.json(
      { error: "Hibás vagy hiányzó API-kulcs (x-api-key fejléc)." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => undefined)) as unknown;
  const rows = readCompanies(body);
  if (!rows || !rows.length) {
    return NextResponse.json(
      {
        error:
          'A törzs legyen egy cég objektum, egy tömb, vagy { "companies": [...] }, legalább egy céggel.',
      },
      { status: 400 },
    );
  }
  if (rows.length > MAX_COMPANIES) {
    return NextResponse.json(
      {
        error: `Egy kérésben legfeljebb ${MAX_COMPANIES} cég mehet (kaptam: ${rows.length}) — bontsd több kérésre.`,
      },
      { status: 413 },
    );
  }
  const dryRun =
    ["1", "true"].includes(request.nextUrl.searchParams.get("dryRun") ?? "") ||
    (body as { dryRun?: unknown })?.dryRun === true;

  try {
    const result = await ingestCompanies(rows, dryRun);
    return NextResponse.json(
      { ok: result.errors.length === 0, ...result },
      { status: result.errors.length && !result.created.length ? 422 : 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: `Nem sikerült menteni: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
