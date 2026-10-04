import { NextRequest, NextResponse } from "next/server";
import { convertCsv } from "@/lib/hunter/convert";
import { PRIORITY_ORDER, type Priority } from "@/lib/hunter/types";
import { createLogger, requestId } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Hunter CSV → lead JSON. Nem ír az adatbázisba; az az /import dolga. */
export async function POST(request: NextRequest) {
  const log = createLogger(`api:convert#${requestId()}`);
  try {
    const body = (await request.json()) as {
      csv?: string;
      emails?: string;
      minPriority?: string;
      keepDuplicates?: boolean;
    };

    const csv = (body.csv ?? "").trim();
    if (!csv) {
      return NextResponse.json(
        { error: "Nincs CSV a kérésben." },
        { status: 400 },
      );
    }

    const minPriority = PRIORITY_ORDER.find(
      (priority) => priority === body.minPriority,
    ) as Priority | undefined;

    const result = convertCsv(csv, {
      ...(minPriority ? { minPriority } : {}),
      keepDuplicates: body.keepDuplicates ?? false,
      ...(body.emails ? { emails: body.emails } : {}),
    });

    if (!result.stats.rows) {
      return NextResponse.json(
        {
          error:
            "Egy sort sem sikerült beolvasni. Kell egy fejlécsor, benne legalább a cégnév és a domain oszloppal.",
        },
        { status: 400 },
      );
    }

    log.info(
      `konvertálva: ${result.stats.rows} sor → ${result.stats.output} lead`,
      {
        prioritas: result.stats.byPriority,
        duplikatum: result.stats.duplicates,
        emaillel: result.stats.withEmail,
        lekepezetlen: result.unmapped,
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
