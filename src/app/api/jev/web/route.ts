import { NextRequest, NextResponse } from "next/server";
import { COUNTRIES } from "@/lib/countries";
import { listJevResults } from "@/lib/jevSweep";
import { jevWebState, startJevWeb, stopJevWeb } from "@/lib/jevWebSweep";
import { isStartupSearchReady } from "@/lib/startupFinder";

export const dynamic = "force-dynamic";

/** Futás állapota + a webes eredmények: `?question=…&leads=1&limit=100`. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const web = jevWebState();
  const question = (params.get("question") ?? web.question).trim();
  const limit = Math.min(500, Math.max(1, Number(params.get("limit")) || 100));
  const results = question
    ? await listJevResults(question, params.get("leads") === "1", limit, "web")
    : { items: [], total: 0, leads: 0 };
  return NextResponse.json({
    web,
    searchReady: isStartupSearchReady(),
    ...results,
  });
}

/**
 * `{ action: "start", question, focus, countries, threshold, autoImport }`
 * vagy `{ action: "stop" }`.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (body?.action === "stop") return NextResponse.json(stopJevWeb());
  if (body?.action !== "start") {
    return NextResponse.json(
      { error: "Ismeretlen művelet — start vagy stop." },
      { status: 400 },
    );
  }

  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  const focus = typeof body.focus === "string" ? body.focus.trim() : "";
  const threshold = Number(body.threshold);
  const countries = Array.isArray(body.countries)
    ? body.countries.filter(
        (code): code is string =>
          typeof code === "string" && code !== "INT" && code in COUNTRIES,
      )
    : [];
  if (!question) {
    return NextResponse.json({ error: "Add meg a kérdést." }, { status: 400 });
  }
  if (focus.length > 300) {
    return NextResponse.json(
      { error: "A fókusz legfeljebb 300 karakter lehet." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    return NextResponse.json(
      { error: "A küszöb 0 és 1 közötti szám legyen (pl. 0.7)." },
      { status: 400 },
    );
  }
  if (!isStartupSearchReady()) {
    return NextResponse.json(
      {
        error:
          "Nincs OPENAI_API_KEY az atlas-credentials.env fájlban — a webes kereséshez kell.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    startJevWeb({
      question,
      focus,
      countries,
      threshold,
      autoImport: body.autoImport !== false,
    }),
  );
}
