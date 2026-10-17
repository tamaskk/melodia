import { NextRequest, NextResponse } from "next/server";
import {
  cleanFilters,
  isSeedtableReady,
  MAX_COMPANIES,
  PEOPLE_ROLES,
  runSeedtableImport,
  SeedtableError,
} from "@/lib/seedtable";

export const dynamic = "force-dynamic";
// Lapozás + cégenkénti személykeresés: a Vercel Hobby felső határa.
export const maxDuration = 300;

/** Be van-e állítva a kulcs, és mekkora egy futás felső határa. */
export async function GET() {
  return NextResponse.json({
    ready: isSeedtableReady(),
    maxCompanies: MAX_COMPANIES,
  });
}

/**
 * Seedtable-import: `{ filters, max, offset, people: { enabled, roles,
 * decisionMakersOnly, allowLowConfidence }, apply }`. `apply: false` csak
 * előnézet — lekéri és egyezteti a cégeket, de semmit nem ment.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      filters?: unknown;
      max?: unknown;
      offset?: unknown;
      people?: {
        enabled?: unknown;
        roles?: unknown;
        decisionMakersOnly?: unknown;
        allowLowConfidence?: unknown;
      };
      apply?: unknown;
    } | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "A body JSON objektum legyen a szűrőkkel." },
        { status: 400 },
      );
    }

    let filters: Record<string, string | string[]>;
    try {
      filters = cleanFilters(body.filters);
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 },
      );
    }

    const max = Number(body.max);
    if (!Number.isInteger(max) || max < 1 || max > MAX_COMPANIES) {
      return NextResponse.json(
        {
          error: `A cégek száma 1 és ${MAX_COMPANIES} közötti egész szám legyen.`,
        },
        { status: 400 },
      );
    }

    const offset = body.offset === undefined ? 0 : Number(body.offset);
    if (!Number.isInteger(offset) || offset < 0) {
      return NextResponse.json(
        { error: "A kezdő sor 0 vagy pozitív egész szám legyen." },
        { status: 400 },
      );
    }

    const roles = Array.isArray(body.people?.roles)
      ? body.people.roles.filter((role): role is string =>
          (PEOPLE_ROLES as readonly string[]).includes(String(role)),
        )
      : [];

    const result = await runSeedtableImport({
      filters,
      max,
      offset,
      people: {
        enabled: body.people?.enabled === true,
        roles,
        decisionMakersOnly: body.people?.decisionMakersOnly === true,
        allowLowConfidence: body.people?.allowLowConfidence === true,
      },
      apply: body.apply === true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: error instanceof SeedtableError ? error.status : 500 },
    );
  }
}
