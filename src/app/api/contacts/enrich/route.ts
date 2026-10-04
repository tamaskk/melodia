import { NextRequest, NextResponse } from "next/server";
import { enrichState, startEnrich, stopEnrich } from "@/lib/enrich";
import { parseNames } from "@/lib/companyLookup";
import { KINDS } from "@/lib/importSchema";
import { COUNTRY_CODES } from "@/lib/countries";
import { COMPANY_SIZES } from "@/lib/types";
import { createLogger } from "@/lib/logger";
import type { CompanySize, ContactKind, Language } from "@/lib/types";
import type { SearchProvider } from "@/lib/emailFinder";

export const dynamic = "force-dynamic";

const log = createLogger("api:felvetel");

/** A futó felvétel + kutatás állapota. */
export async function GET() {
  return NextResponse.json(enrichState());
}

/**
 * `{ action: "start" | "stop" }`.
 *
 * Indításkor a nevekből sorok lesznek (levéllel együtt), majd a szerver
 * egyesével végigkutatja őket. A kérés nem várja meg — az állapotot a GET adja.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      names?: unknown;
      text?: unknown;
      source?: string;
      kind?: string;
      country?: string;
      size?: string;
      language?: string;
      provider?: string;
      delayMs?: number;
    };

    if (body.action === "stop") return NextResponse.json(stopEnrich());

    const names = Array.isArray(body.names)
      ? body.names.filter((item): item is string => typeof item === "string")
      : typeof body.text === "string"
        ? parseNames(body.text)
        : [];

    if (!names.length) {
      return NextResponse.json({ error: "Nincs felvehető cégnév." }, { status: 400 });
    }

    const source = (body.source ?? "").trim();
    if (!source) {
      return NextResponse.json(
        { error: "Adj meg forrást — ez alapján lehet később szűrni a listában." },
        { status: 400 },
      );
    }

    const kind = (KINDS as string[]).includes(body.kind ?? "")
      ? (body.kind as ContactKind)
      : "it-company";
    // Névből felvett cégnél a székhelyet ritkán tudjuk: alapból "nemzetközi".
    const country = COUNTRY_CODES.includes(String(body.country ?? "").toUpperCase())
      ? String(body.country).toUpperCase()
      : "INT";
    const language: Language = body.language === "hu" ? "hu" : "en";
    // IT cégnél a séma kötelezővé teszi a létszám-sávot; tippelni viszont nem
    // akarunk, ezért az "ismeretlen" sáv az alapértelmezés.
    const size = (COMPANY_SIZES as readonly string[]).includes(String(body.size))
      ? (body.size as CompanySize)
      : kind === "it-company"
        ? ("ismeretlen" as CompanySize)
        : null;
    const provider = (["openai", "claude", "codex"] as const).includes(
      body.provider as SearchProvider,
    )
      ? (body.provider as SearchProvider)
      : "claude";

    const state = startEnrich({
      names,
      source,
      kind,
      size,
      country,
      language,
      provider,
      delayMs: Math.max(0, Math.min(60_000, Number(body.delayMs ?? 1500))),
    });

    log.info(`indítás: ${names.length} név, forrás "${source}", motor ${provider}`);
    return NextResponse.json(state);
  } catch (error) {
    log.error("hiba", (error as Error).message);
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
