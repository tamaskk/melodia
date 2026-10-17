import { NextRequest, NextResponse } from "next/server";
import {
  jevSweepState,
  listJevResults,
  startJevSweep,
  stopJevSweep,
} from "@/lib/jevSweep";
import type { ContactFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Futás állapota + a legutóbbi eredmények: `?question=…&leads=1&limit=100`. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sweep = jevSweepState();
  const question = (params.get("question") ?? sweep.question).trim();
  const limit = Math.min(500, Math.max(1, Number(params.get("limit")) || 100));
  const results = question
    ? await listJevResults(question, params.get("leads") === "1", limit)
    : { items: [], total: 0, leads: 0 };
  return NextResponse.json({ sweep, ...results });
}

/** `{ action: "start", question, threshold, concurrency, filters }` vagy `{ action: "stop" }`. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    question?: unknown;
    threshold?: unknown;
    concurrency?: unknown;
    filters?: unknown;
  } | null;

  if (body?.action === "stop") return NextResponse.json(stopJevSweep());
  if (body?.action !== "start") {
    return NextResponse.json(
      { error: "Ismeretlen művelet — start vagy stop." },
      { status: 400 },
    );
  }

  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  const threshold = Number(body.threshold);
  const concurrency = Number(body.concurrency);
  if (!question) {
    return NextResponse.json({ error: "Add meg a kérdést." }, { status: 400 });
  }
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    return NextResponse.json(
      { error: "A küszöb 0 és 1 közötti szám legyen (pl. 0.8)." },
      { status: 400 },
    );
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    return NextResponse.json(
      { error: "A párhuzamosság 1 és 8 közötti egész legyen." },
      { status: 400 },
    );
  }
  const raw =
    body.filters && typeof body.filters === "object"
      ? (body.filters as Record<string, unknown>)
      : {};
  // Csak a felületen állítható szűrők mennek tovább.
  const filters: ContactFilters = {};
  if (typeof raw.source === "string" && raw.source) filters.source = raw.source;
  if (typeof raw.country === "string" && raw.country)
    filters.country = raw.country;
  if (typeof raw.kind === "string" && raw.kind) filters.kind = raw.kind;

  return NextResponse.json(
    startJevSweep({ question, threshold, concurrency, filters }),
  );
}
