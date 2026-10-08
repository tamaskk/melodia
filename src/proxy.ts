import { NextResponse, type NextRequest } from "next/server";
import { authMode, SESSION_COOKIE, verifySession } from "@/lib/auth";

/**
 * Ami belépés nélkül is elérhető: a belépő oldal, a belépés végpontja, és a
 * külső kutatóbot két API-ja (az szándékosan kulcs nélküli — `docs/GROKBOT.md`).
 */
const PUBLIC = [/^\/login$/, /^\/api\/auth$/, /^\/api\/bot\//];

/** Minden más kérés előtt: van-e érvényes munkamenet. */
export function proxy(request: NextRequest) {
  const mode = authMode();
  if (mode === "open") return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((pattern) => pattern.test(pathname))) {
    return NextResponse.next();
  }
  if (
    mode === "password" &&
    verifySession(request.cookies.get(SESSION_COOKIE)?.value)
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Nincs belépve. Jelentkezz be a /login oldalon." },
      { status: 401 },
    );
  }
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search =
    pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(login);
}

export const config = {
  // A statikus fájlokat nem védjük: nélkülük a belépő oldal sem töltene be.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
