/**
 * Belépés egyetlen fiókkal: e-mail cím és jelszó.
 *
 * Mindkettő beállítás: `APP_EMAIL` és `APP_PASSWORD` (helyben az
 * `atlas-credentials.env`-ben, a telepített példányon környezeti változóként).
 * A munkamenet aláírt süti: a lejárat ideje és annak HMAC-ja — adatbázis nem
 * kell hozzá, és a cím vagy a jelszó megváltoztatása minden korábbi
 * munkamenetet érvénytelenít.
 *
 * A proxy (`src/proxy.ts`) is ezt használja, ezért itt nincs adatbázis és nincs
 * más modulra épülő állapot.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { credential } from "./env";

export const SESSION_COOKIE = "melodia_session";
/** Ennyi ideig él egy belépés. */
export const SESSION_SECONDS = 30 * 24 * 3600;

/**
 * `password` = be kell lépni · `open` = semmi nincs beállítva, helyi gépen
 * szabad az út · `locked` = hiányos a beállítás (telepített példányon bármelyik
 * hiányzik, vagy helyben csak az egyik van meg): így nyilvános vagy félig védett
 * lenne, ezért senkit nem engedünk be.
 */
export type AuthMode = "password" | "open" | "locked";

const email = () => credential("APP_EMAIL").trim().toLowerCase();

export function authMode(): AuthMode {
  const hasEmail = Boolean(email());
  const hasPassword = Boolean(credential("APP_PASSWORD"));
  if (hasEmail && hasPassword) return "password";
  if (!hasEmail && !hasPassword && !process.env.VERCEL) return "open";
  return "locked";
}

/** Mi hiányzik a belépéshez — a zárolt példány ezt írja ki. */
export function missingSettings(): string[] {
  return [
    ...(email() ? [] : ["APP_EMAIL"]),
    ...(credential("APP_PASSWORD") ? [] : ["APP_PASSWORD"]),
  ];
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Mindkét mezőt mindig összevetjük: sem az időzítésből, sem a hibaüzenetből
 * nem derül ki, hogy a cím vagy a jelszó volt-e rossz.
 */
export function checkLogin(inputEmail: string, inputPassword: string): boolean {
  if (authMode() !== "password") return false;
  const emailOk = timingSafeEqual(
    digest(inputEmail.trim().toLowerCase()),
    digest(email()),
  );
  const passwordOk = timingSafeEqual(
    digest(inputPassword),
    digest(credential("APP_PASSWORD")),
  );
  return emailOk && passwordOk;
}

function sign(expires: string): string {
  return createHmac(
    "sha256",
    digest(`melodia:${email()}:${credential("APP_PASSWORD")}`),
  )
    .update(expires)
    .digest("base64url");
}

export function createSession(now = Date.now()): string {
  const expires = String(now + SESSION_SECONDS * 1000);
  return `${expires}.${sign(expires)}`;
}

export function verifySession(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || !/^\d+$/.test(expires)) return false;
  if (Number(expires) <= now) return false;
  const expected = Buffer.from(sign(expires));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Belépés után csak saját oldalra irányítunk — külső címre soha. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
