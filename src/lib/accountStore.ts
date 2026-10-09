/**
 * A felületen hozzáadott küldő fiókok, adatbázisban.
 *
 * Két fajta: Gmail (SMTP, app-jelszóval) és Resend (HTTP API, közös kulccsal).
 * A Gmail app-jelszó titkosítva tárolódik; a kulcs (`MAIL_SECRET_KEY`) csak az
 * `atlas-credentials.env`-ben él, így az adatbázis önmagában nem elég hozzá.
 *
 * A többi modul szinkron olvas (`storedAccounts`), ezért a lista memóriában
 * van, és a belépési pontok töltik be (`loadStoredAccounts`).
 */
import type { WarmupStep } from "./warmup";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { credential } from "./env";
import { createLogger } from "./logger";
import { getDb } from "./mongodb";

const log = createLogger("fiokok");

export type MailProvider = "gmail" | "resend";

interface Sealed {
  iv: string;
  tag: string;
  data: string;
}

interface StoredDoc {
  provider: MailProvider;
  /** A cím: Gmailnél a belépési név, Resendnél a feladó címe. Egyedi. */
  user: string;
  label: string;
  /** Megjelenő feladónév; Gmailnél üresen a közös beállítás él. */
  fromName: string | null;
  password?: Sealed;
  createdAt: string;
}

export interface StoredAccount {
  provider: MailProvider;
  user: string;
  label: string;
  fromName: string | null;
  /** Visszafejtett app-jelszó; Resendnél üres. */
  password: string;
}

export interface StoredAccountInfo {
  provider: MailProvider;
  user: string;
  label: string;
  fromName: string | null;
  /** Hamis, ha a jelszó a mostani kulccsal nem fejthető vissza. */
  usable: boolean;
}

export interface NewAccount {
  provider?: unknown;
  user?: unknown;
  password?: unknown;
  label?: unknown;
  name?: unknown;
}

const EMAIL_RX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
/** Ennyi ideig hisszük el a memóriában lévő listát újraolvasás nélkül. */
const FRESH_MS = 30_000;

// A `globalThis`-en él, mert a Next a route-okat és az instrumentationt külön
// modulpéldányba töltheti (lásd a sendCampaign.ts megjegyzését).
const shared = globalThis as typeof globalThis & {
  __melodiaStoredAccounts?: {
    list: StoredAccount[];
    /** Fiókok, amelyeken a felfuttatás ki van kapcsolva → a saját napi maximumuk. */
    noWarmup: Map<string, number | null>;
    /** Fiók → saját lépcsősor és kézzel állított kezdés (ami nincs, az alapértelmezés). */
    warmups: Map<string, AccountWarmup>;
    at: number;
  };
};

function secretKey(): Buffer | null {
  const key = Buffer.from(credential("MAIL_SECRET_KEY"), "base64");
  return key.length === 32 ? key : null;
}

export function isSecretReady(): boolean {
  return secretKey() !== null;
}

function seal(plain: string, key: Buffer): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

function open(box: Sealed, key: Buffer): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(box.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(box.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

let indexReady: Promise<unknown> | null = null;

async function collection() {
  const db = await getDb();
  const accounts = db.collection<StoredDoc>("mail_accounts");
  indexReady ??= accounts
    .createIndex({ user: 1 }, { unique: true })
    .catch(() => {
      indexReady = null;
    });
  await indexReady;
  return accounts;
}

function readable(doc: StoredDoc, key: Buffer | null): StoredAccount | null {
  if (doc.provider === "resend") {
    return { ...pick(doc), password: "" };
  }
  if (!key || !doc.password) return null;
  try {
    return { ...pick(doc), password: open(doc.password, key) };
  } catch {
    return null;
  }
}

function pick(doc: StoredDoc) {
  return {
    provider: doc.provider,
    user: doc.user,
    label: doc.label,
    fromName: doc.fromName,
  };
}

/**
 * A fiókok betöltése a memóriába. Olcsó újrahívni: fél percen belül nem megy
 * új lekérdezés, hacsak nem kéred (`force`). Ha az adatbázis nem érhető el, a
 * korábbi lista marad — egy futó küldés ettől ne veszítse el a fiókját.
 */
export async function loadStoredAccounts(force = false): Promise<void> {
  const cached = shared.__melodiaStoredAccounts;
  if (!force && cached && Date.now() - cached.at < FRESH_MS) return;
  try {
    const docs = await (
      await collection()
    )
      .find({}, { projection: { _id: 0 } })
      .sort({ createdAt: 1 })
      .toArray();
    const key = secretKey();
    const list: StoredAccount[] = [];
    for (const doc of docs) {
      const account = readable(doc, key);
      if (account) list.push(account);
      else
        log.warn(
          `${doc.user}: a jelszó nem fejthető vissza — hiányzik vagy megváltozott a MAIL_SECRET_KEY`,
        );
    }
    // Fiókonként egy kis sor — mind kell, szűrni nem érdemes.
    const all = await (
      await settings()
    )
      .find({}, { projection: { _id: 0 } })
      .toArray();
    shared.__melodiaStoredAccounts = {
      list,
      noWarmup: new Map(
        all
          .filter((doc) => doc.warmup === false)
          .map((doc) => [doc.user, doc.dailyMax ?? null]),
      ),
      warmups: new Map(
        all.map((doc) => [
          doc.user,
          {
            steps: doc.warmupSteps?.length ? doc.warmupSteps : null,
            startAt: doc.warmupStart ?? null,
          },
        ]),
      ),
      at: Date.now(),
    };
  } catch (error) {
    log.warn(`a fiókok betöltése nem sikerült: ${(error as Error).message}`);
  }
}

/** A fiók saját felfuttatása: ami `null`, ott az alapértelmezés él. */
export interface AccountWarmup {
  /** Saját lépcsősor; `null` = a szolgáltató alapértelmezése. */
  steps: WarmupStep[] | null;
  /** Kézzel állított kezdés (újraindítás); `null` = az első küldéstől számít. */
  startAt: string | null;
}

interface SettingsDoc {
  user: string;
  warmup: boolean;
  /** Saját napi maximum; csak kikapcsolt felfuttatásnál él. */
  dailyMax?: number | null;
  warmupSteps?: WarmupStep[] | null;
  warmupStart?: string | null;
}

/**
 * Fiókonkénti beállítások. Külön gyűjtemény, mert az env-ből jövő fiókoknak
 * nincs soruk a `mail_accounts`-ban, de beállításuk nekik is lehet.
 */
async function settings() {
  return (await getDb()).collection<SettingsDoc>("mail_account_settings");
}

/** Követi-e a fiók a felfuttatást. Alapból igen. */
export function warmupEnabled(user: string): boolean {
  return !shared.__melodiaStoredAccounts?.noWarmup.has(user);
}

/**
 * A fiók saját napi maximuma — a felfuttatás helyett, ha az ki van kapcsolva.
 * `null`: nincs megadva (ilyenkor csak az indításkor beállított keret él).
 */
export function accountDailyMax(user: string): number | null {
  return shared.__melodiaStoredAccounts?.noWarmup.get(user) ?? null;
}

/** A fiók saját lépcsősora és kézzel állított kezdése. */
export function accountWarmup(user: string): AccountWarmup {
  return (
    shared.__melodiaStoredAccounts?.warmups.get(user) ?? {
      steps: null,
      startAt: null,
    }
  );
}

/** Csak a megadott mezőt írja: a kapcsoló nem törli a számot, és fordítva. */
export async function saveAccountSettings(
  user: string,
  change: {
    warmup?: boolean;
    dailyMax?: number | null;
    warmupSteps?: WarmupStep[] | null;
    warmupStart?: string | null;
  },
): Promise<void> {
  await (
    await settings()
  ).updateOne(
    { user },
    {
      $set: { user, ...change },
      $setOnInsert: "warmup" in change ? {} : { warmup: true },
    },
    { upsert: true },
  );
  await loadStoredAccounts(true);
  log.info(`${user}: beállítás mentve`, change);
}

/** A betöltött fiókok. Előtte valahol le kell futnia a `loadStoredAccounts`-nak. */
export function storedAccounts(): StoredAccount[] {
  return shared.__melodiaStoredAccounts?.list ?? [];
}

/** A felületnek: minden tárolt fiók, jelszó nélkül — a nem olvashatók is. */
export async function listStoredAccounts(): Promise<StoredAccountInfo[]> {
  const docs = await (
    await collection()
  )
    .find({}, { projection: { _id: 0 } })
    .sort({ createdAt: 1 })
    .toArray();
  const key = secretKey();
  return docs.map((doc) => ({
    ...pick(doc),
    usable: readable(doc, key) !== null,
  }));
}

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/**
 * Új fiók mentése. Hibát dob emberi mondattal, ha valami hiányzik — és Gmailnél
 * akkor is, ha a belépés nem megy: rossz jelszóval nem mentünk fiókot.
 */
export async function addStoredAccount(
  input: NewAccount,
  /** A már létező fiókok címei (az env-ből jövők is). */
  taken: string[],
): Promise<StoredAccountInfo> {
  const provider = input.provider === "resend" ? "resend" : "gmail";
  const user = text(input.user).toLowerCase();
  if (!EMAIL_RX.test(user))
    throw new Error("Adj meg egy érvényes e-mail címet.");
  if (taken.includes(user))
    throw new Error(`Ez a cím már fel van véve: ${user}`);

  const label = text(input.label) || (user.split("@")[0] ?? user);
  const doc: StoredDoc = {
    provider,
    user,
    label,
    fromName: null,
    createdAt: new Date().toISOString(),
  };

  if (provider === "resend") {
    const name = text(input.name);
    if (!name)
      throw new Error("Add meg a feladó nevét — ez látszik a címzettnél.");
    if (!credential("RESEND_API_KEY")) {
      throw new Error(
        "Nincs RESEND_API_KEY az atlas-credentials.env fájlban. Tedd bele, majd indítsd újra a szervert.",
      );
    }
    doc.fromName = name;
  } else {
    // A Google szóközökkel adja meg az app-jelszót; a szóköz nem része.
    const password = text(input.password).replace(/\s+/g, "");
    if (!password) throw new Error("Add meg a Google app-jelszót.");
    const key = secretKey();
    if (!key) {
      throw new Error(
        "Hiányzik a MAIL_SECRET_KEY az atlas-credentials.env fájlból — ezzel titkosítjuk a jelszót. " +
          "Generálj egyet (openssl rand -base64 32), írd be, és indítsd újra a szervert.",
      );
    }
    await verifyGmail(user, password);
    doc.password = seal(password, key);
  }

  await (await collection()).insertOne(doc);
  await loadStoredAccounts(true);
  log.info(`új fiók: ${user} (${provider})`);
  return { ...pick(doc), usable: true };
}

async function verifyGmail(user: string, pass: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  try {
    await transporter.verify();
  } catch (error) {
    const message = (error as Error).message;
    throw new Error(
      /invalid login|username and password/i.test(message)
        ? "A Gmail elutasította a belépést. App-jelszó kell (nem a fiókjelszavad), " +
            "és be kell kapcsolni a kétlépcsős azonosítást."
        : `Nem sikerült csatlakozni a Gmailhez: ${message}`,
    );
  } finally {
    transporter.close();
  }
}

export async function removeStoredAccount(user: string): Promise<boolean> {
  const result = await (
    await collection()
  ).deleteOne({
    user: user.trim().toLowerCase(),
  });
  await loadStoredAccounts(true);
  if (result.deletedCount) log.warn(`fiók törölve: ${user}`);
  return result.deletedCount === 1;
}
