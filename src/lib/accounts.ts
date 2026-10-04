/**
 * Több Gmail-fiók a kiküldéshez.
 *
 * Minden fiók külön app-jelszóval megy, külön napi kerettel és külön
 * ütemezéssel — így párhuzamosan futhat több küldés anélkül, hogy bármelyik
 * fiók a napi limitje közelébe kerülne.
 *
 * A hitelesítő adatok kizárólag az `atlas-credentials.env`-ben élnek:
 *
 * ```bash
 * GMAIL_USER="elso@gmail.com"                 # 1. fiók
 * GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"
 * GMAIL_FROM_NAME="Kálmán Tamás Krisztián"
 *
 * GMAIL_USER_2="masodik@gmail.com"            # 2. fiók
 * GMAIL_APP_PASSWORD_2="xxxx xxxx xxxx xxxx"
 * GMAIL_LABEL_2="Tartalék"                    # opcionális, a felületen ez látszik
 * ```
 *
 * A számozás 2-től 10-ig megy, a hézag nem baj.
 */
import { credential } from "./env";
import { PROFILE } from "./profile";

export interface MailAccount {
  /** A cím maga — stabil azonosító, újraindítás után is ugyanaz. */
  id: string;
  user: string;
  password: string;
  fromName: string;
  replyTo: string | null;
  /** Rövid név a felületen. Alapból a cím @ előtti része. */
  label: string;
}

const MAX_ACCOUNTS = 10;

function read(suffix: string): MailAccount | null {
  const user = credential(`GMAIL_USER${suffix}`).trim().toLowerCase();
  // A Google szóközökkel adja meg az app-jelszót; a szóköz nem része.
  const password = credential(`GMAIL_APP_PASSWORD${suffix}`).replace(
    /\s+/g,
    "",
  );
  if (!user || !password) return null;

  return {
    id: user,
    user,
    password,
    fromName:
      credential(`GMAIL_FROM_NAME${suffix}`) ||
      credential("GMAIL_FROM_NAME") ||
      credential("GMAIL_FROM_NAME_1", PROFILE.name),
    replyTo:
      credential(`GMAIL_REPLY_TO${suffix}`) ||
      credential("GMAIL_REPLY_TO") ||
      null,
    label: credential(`GMAIL_LABEL${suffix}`) || (user.split("@")[0] ?? user),
  };
}

/**
 * Minden beállított fiók, az env-ben megadott sorrendben.
 *
 * Az első fiók írható `GMAIL_USER` és `GMAIL_USER_1` néven is — kézzel
 * szerkesztve az utóbbi a természetesebb, ha több fiók van egymás alatt.
 */
export function listAccounts(): MailAccount[] {
  const accounts: MailAccount[] = [];
  const seen = new Set<string>();

  const suffixes = [
    "",
    "_1",
    ...Array.from({ length: MAX_ACCOUNTS - 1 }, (_, i) => `_${i + 2}`),
  ];
  for (const suffix of suffixes) {
    const account = read(suffix);
    if (!account || seen.has(account.id)) continue;
    seen.add(account.id);
    accounts.push(account);
  }
  return accounts;
}

/** Egy fiók azonosító alapján. Azonosító nélkül az elsőt adja. */
export function getAccount(id?: string | null): MailAccount | null {
  const accounts = listAccounts();
  if (!id) return accounts[0] ?? null;
  const wanted = id.trim().toLowerCase();
  return accounts.find((account) => account.id === wanted) ?? null;
}

/** A felületnek: jelszó nélkül. */
export function publicAccounts(): {
  id: string;
  user: string;
  label: string;
}[] {
  return listAccounts().map(({ id, user, label }) => ({ id, user, label }));
}
