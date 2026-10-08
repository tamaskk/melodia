import { NextRequest, NextResponse } from "next/server";
import {
  authMode,
  checkLogin,
  createSession,
  missingSettings,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from "@/lib/auth";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("api:belepes");

/** Belépés: `{ email, password }`. Siker esetén beállítja a munkamenet-sütit. */
export async function POST(request: NextRequest) {
  const mode = authMode();
  if (mode === "open") return NextResponse.json({ ok: true });
  if (mode === "locked") {
    return NextResponse.json(
      {
        error: `Hiányos a belépés beállítása: ${missingSettings().join(" és ")}. Add meg, és indítsd újra (telepített példányon: telepítsd újra).`,
      },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    password?: unknown;
  };
  if (
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    !checkLogin(body.email, body.password)
  ) {
    // A találgatást lassítjuk: minden hibás próba fél másodpercet vár.
    await new Promise((resolve) => setTimeout(resolve, 500));
    log.warn("sikertelen belépés");
    return NextResponse.json(
      { error: "Hibás e-mail cím vagy jelszó." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  log.info("belépés");
  return response;
}

/** Kilépés: törli a sütit. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
