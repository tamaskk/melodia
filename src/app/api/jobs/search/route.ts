import { NextRequest, NextResponse } from "next/server";
import { searchAll } from "@/lib/jobs/sources";

export const dynamic = "force-dynamic";
// A források belső, közös időkorlátja 25 mp — efölött van a mozgástér.
export const maxDuration = 60;

const DESCRIPTION_CHARS = 240;

const list = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * Keresés minden (vagy a kiválasztott) forrásban.
 * `?q&countries=HU,DE&remote=1&sources=greenhouse,lever&limit=500`
 *
 * Egy forrás hibája nem ad hibás választ: a `sources[]` megfelelő eleme jelzi.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = Number(params.get("limit") ?? 500);

  try {
    const result = await searchAll(
      {
        q: (params.get("q") ?? "").trim(),
        countries: list(params.get("countries")).map((c) => c.toUpperCase()),
        remoteOnly: params.get("remote") === "1",
        limit:
          Number.isFinite(limit) && limit > 0 ? Math.min(limit, 1000) : 500,
      },
      list(params.get("sources")),
    );
    return NextResponse.json({
      ...result,
      // A nyers forrásobjektum nagy, és a böngészőnek nem kell; a leírásból a
      // kártya csak az elejét mutatja, a többit kár áthúzni.
      jobs: result.jobs.map((job) => ({
        ...job,
        raw: undefined,
        description: job.description?.slice(0, DESCRIPTION_CHARS),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `A keresés nem futott le: ${(error as Error).message}. Próbáld újra, vagy szűkítsd a forrásokat.`,
      },
      { status: 500 },
    );
  }
}
