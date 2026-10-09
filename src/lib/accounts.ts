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
 *
 * Emellett a felületen (`/accounts`) is felvehető fiók — Gmail vagy Resend —,
 * ezek az adatbázisban élnek (`accountStore.ts`), és az env-fiókok után jönnek.
 */
import { getDb } from "./mongodb";
import { warmupStatus, type WarmupStatus, type WarmupStep } from "./warmup";
import {
  accountDailyMax,
  accountWarmup,
  listStoredAccounts,
  loadStoredAccounts,
  storedAccounts,
  warmupEnabled,
  type MailProvider,
} from "./accountStore";
import { credential } from "./env";
import { PROFILE } from "./profile";

/** A belépési pontok ezt várják meg, mielőtt a fiókokat olvassák. */
export const ensureAccounts = loadStoredAccounts;

export interface MailAccount {
  /** A cím maga — stabil azonosító, újraindítás után is ugyanaz. */
  id: string;
  /** `gmail` = SMTP app-jelszóval, `resend` = a Resend HTTP API-ján át. */
  provider: MailProvider;
  /** A felületen vették fel (adatbázisban él), nem az env-ből jön. */
  stored: boolean;
  /** Követi-e a felfuttatást (warmup.ts). Fiókonként kikapcsolható. */
  warmup: boolean;
  /** Saját napi maximum kikapcsolt felfuttatásnál; `null` = nincs megadva. */
  dailyMax: number | null;
  /** Saját felfuttatási lépcsősor; `null` = a szolgáltató alapértelmezése. */
  warmupSteps: WarmupStep[] | null;
  /** Kézzel állított kezdés (újraindítás); `null` = az első küldéstől számít. */
  warmupStart: string | null;
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
  // Helykitöltő érték ("-", "x", "TODO") ne legyen fiók: az első fiók az
  // alapértelmezett küldő és a postafiók-szinkron fiókja is.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user) || !password) return null;

  return {
    id: user,
    provider: "gmail",
    stored: false,
    warmup: warmupEnabled(user),
    dailyMax: accountDailyMax(user),
    warmupSteps: accountWarmup(user).steps,
    warmupStart: accountWarmup(user).startAt,
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

  for (const stored of storedAccounts()) {
    if (seen.has(stored.user)) continue;
    seen.add(stored.user);
    accounts.push({
      id: stored.user,
      provider: stored.provider,
      stored: true,
      warmup: warmupEnabled(stored.user),
      dailyMax: accountDailyMax(stored.user),
      warmupSteps: accountWarmup(stored.user).steps,
      warmupStart: accountWarmup(stored.user).startAt,
      user: stored.user,
      password: stored.password,
      fromName:
        stored.fromName ||
        credential("GMAIL_FROM_NAME") ||
        credential("GMAIL_FROM_NAME_1", PROFILE.name),
      replyTo: credential("GMAIL_REPLY_TO") || null,
      label: stored.label,
    });
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
  provider: MailProvider;
}[] {
  return listAccounts().map(({ id, user, label, provider }) => ({
    id,
    user,
    label,
    provider,
  }));
}

export interface AccountOverview {
  id: string;
  provider: MailProvider;
  user: string;
  label: string;
  fromName: string;
  /** Törölhető a felületről; az env-ből jövő fiók nem. */
  stored: boolean;
  warmup: boolean;
  dailyMax: number | null;
  /** Hol tart a felfuttatásban, és milyen lépcsőkön megy. */
  warmupStatus: WarmupStatus;
  /** Hamis, ha a tárolt jelszó a mostani kulccsal nem fejthető vissza. */
  usable: boolean;
}

/** A fiókok oldalának: minden fiók, jelszó nélkül — a nem használhatók is. */
export async function accountOverview(): Promise<AccountOverview[]> {
  await loadStoredAccounts(true);
  // A felfuttatás kezdete: a kiküldő menetek mentett első küldése.
  const first = new Map(
    (
      await (
        await getDb()
      )
        .collection<{ accountId: string; firstSendAt?: string }>("campaigns")
        .find({}, { projection: { _id: 0, accountId: 1, firstSendAt: 1 } })
        .toArray()
    ).map((doc) => [doc.accountId, doc.firstSendAt ?? null]),
  );
  const usable = listAccounts().map((account) => ({
    id: account.id,
    provider: account.provider,
    user: account.user,
    label: account.label,
    fromName: account.fromName,
    stored: account.stored,
    warmup: account.warmup,
    dailyMax: account.dailyMax,
    warmupStatus: warmupStatus(
      account.warmupStart ?? first.get(account.id) ?? null,
      Boolean(account.warmupStart),
      account.provider,
      account.warmupSteps,
    ),
    usable: true,
  }));
  const known = new Set(usable.map((account) => account.id));
  const broken = (await listStoredAccounts())
    .filter((account) => !account.usable && !known.has(account.user))
    .map((account) => ({
      id: account.user,
      provider: account.provider,
      user: account.user,
      label: account.label,
      fromName: account.fromName ?? "",
      stored: true,
      warmup: true,
      dailyMax: null,
      warmupStatus: warmupStatus(null, false, account.provider, null),
      usable: false,
    }));
  return [...usable, ...broken];
}
