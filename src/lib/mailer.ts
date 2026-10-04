/**
 * Levélküldés a saját Gmail-fiókodból, SMTP-n keresztül.
 *
 * Ingyenes: nem kell szolgáltatás, csak egy Google **app-jelszó** (kétlépcsős
 * azonosítás bekapcsolva → https://myaccount.google.com/apppasswords). A jelszó
 * az `atlas-credentials.env`-be kerül, sehova máshova.
 *
 * A napi 15-20 levél messze a Gmail ~500 címzett/napos kerete alatt van.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { getAccount, listAccounts, type MailAccount } from "./accounts";
import { listAttachments, resolveSelection } from "./attachments";
import { createLogger } from "./logger";
import type { ContactDoc } from "./types";

const log = createLogger("mailer");

export type MailerConfig = MailAccount;

/** Egy fiók beállításai. Azonosító nélkül az első (alap) fiók. */
export function mailerConfig(accountId?: string | null): MailerConfig | null {
  return getAccount(accountId);
}

export function isMailerReady(): boolean {
  return listAccounts().length > 0;
}

// Fiókonként egy kapcsolat: a Gmail nem szereti a küldésenkénti újracsatlakozást.
const transporters = new Map<string, Transporter>();

function getTransporter(config: MailerConfig): Transporter {
  const existing = transporters.get(config.id);
  if (existing) return existing;

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: config.user, pass: config.password },
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
  });
  transporters.set(config.id, transporter);
  return transporter;
}

/** Kapcsolat- és jelszóellenőrzés küldés nélkül. */
export async function verifyMailer(
  accountId?: string | null,
): Promise<{ ok: boolean; message: string }> {
  const config = mailerConfig(accountId);
  if (!config) {
    return {
      ok: false,
      message:
        "Nincs beállítva a küldés. Az atlas-credentials.env-be kell: GMAIL_USER és " +
        "GMAIL_APP_PASSWORD (Google app-jelszó, kétlépcsős azonosítással).",
    };
  }
  try {
    await getTransporter(config).verify();
    log.info("SMTP kapcsolat rendben", { user: config.user });
    return { ok: true, message: `Kapcsolat rendben: ${config.user}` };
  } catch (error) {
    const message = (error as Error).message;
    log.error("SMTP hiba", message);
    return {
      ok: false,
      message: /invalid login|username and password/i.test(message)
        ? "A Gmail elutasította a belépést. App-jelszó kell (nem a fiókjelszavad), " +
          "és be kell kapcsolni a kétlépcsős azonosítást."
        : message,
    };
  }
}

export interface SendResult {
  /** Melyik fiókból ment ki. */
  account: string;
  messageId: string;
  accepted: string[];
  rejected: string[];
  attachments: string[];
}

/**
 * Egy levél kiküldése. A tárgy és a szöveg a kontakté — semmit nem alakítunk
 * rajta, csak sima szövegként küldjük (nincs HTML, nincs nyomkövetés).
 */
export async function sendContactEmail(
  contact: ContactDoc,
  /** Kiválasztott fájlok az `attachments/` mappához képest. Üres = mind. */
  attachmentKeys?: string[],
  /** Melyik fiókból menjen. Üresen az első fiók. */
  accountId?: string | null,
  /**
   * Csatolmány helyett link a CV-re (a levél végére kerül). Kézbesíthetőség:
   * a PDF-csatolmányos első levelet a szűrők gyanúsabbnak látják.
   */
  cvUrl?: string | null,
): Promise<SendResult> {
  const config = mailerConfig(accountId);
  if (!config) throw new Error("Nincs beállítva a Gmail-küldés.");
  if (!contact.primaryEmail)
    throw new Error("Ehhez a sorhoz nincs e-mail cím.");
  if (!contact.emailSubject?.trim() || !contact.emailBody?.trim()) {
    throw new Error("Üres tárgy vagy levélszöveg — ezt nem küldöm el.");
  }

  // Vagy amit kiválasztottál, vagy (választás híján) a mappa teljes tartalma —
  // CV-link módban egyik sem: a levél végén a link helyettesíti.
  const { files, warning } = cvUrl
    ? {
        files: [] as Awaited<ReturnType<typeof listAttachments>>["files"],
        warning: null,
      }
    : attachmentKeys?.length
      ? await resolveSelection(attachmentKeys, contact.language)
      : await listAttachments(contact.language);
  if (warning) log.warn(warning);
  const text = cvUrl
    ? `${contact.emailBody}\n\n${contact.language === "hu" ? "Önéletrajzom" : "My CV"}: ${cvUrl}`
    : contact.emailBody;

  const info = await getTransporter(config).sendMail({
    from: `${config.fromName} <${config.user}>`,
    to: contact.primaryEmail,
    ...(config.replyTo ? { replyTo: config.replyTo } : {}),
    subject: contact.emailSubject,
    text,
    attachments: files.map((file) => ({
      filename: file.filename,
      path: file.path,
    })),
  });

  const accepted = (info.accepted ?? []).map(String);
  const rejected = (info.rejected ?? []).map(String);
  log.info(`levél elküldve: ${contact.company} → ${contact.primaryEmail}`, {
    fiok: config.user,
    messageId: info.messageId,
    csatolmany: files.map((file) => file.filename),
    rejected,
  });

  if (!accepted.length) {
    throw new Error(
      `A Gmail nem fogadta el a címzettet: ${rejected.join(", ")}`,
    );
  }

  return {
    account: config.user,
    messageId: String(info.messageId ?? ""),
    accepted,
    rejected,
    attachments: files.map((file) => file.filename),
  };
}

/**
 * Follow-up ugyanabban a szálban: `Re:` tárgy, `In-Reply-To` / `References`
 * fejléc az eredeti levélre, csatolmány nélkül (a CV már az első levélben ment).
 */
export async function sendFollowUpEmail(options: {
  accountId?: string | null;
  to: string;
  company: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  /** A naplóban: „follow-up” vagy „válasz”. */
  kind?: string;
}): Promise<SendResult> {
  const config = mailerConfig(options.accountId);
  if (!config) throw new Error("Nincs beállítva a Gmail-küldés.");
  if (!options.body.trim())
    throw new Error("Üres follow-up — ezt nem küldöm el.");

  const reference = options.inReplyTo
    ? options.inReplyTo.startsWith("<")
      ? options.inReplyTo
      : `<${options.inReplyTo}>`
    : null;

  const info = await getTransporter(config).sendMail({
    from: `${config.fromName} <${config.user}>`,
    to: options.to,
    ...(config.replyTo ? { replyTo: config.replyTo } : {}),
    subject: options.subject,
    text: options.body,
    ...(reference ? { inReplyTo: reference, references: [reference] } : {}),
  });

  const accepted = (info.accepted ?? []).map(String);
  const rejected = (info.rejected ?? []).map(String);
  log.info(
    `${options.kind ?? "follow-up"} elküldve: ${options.company} → ${options.to}`,
    {
      fiok: config.user,
      messageId: info.messageId,
      szalban: Boolean(reference),
    },
  );
  if (!accepted.length) {
    throw new Error(
      `A Gmail nem fogadta el a címzettet: ${rejected.join(", ")}`,
    );
  }
  return {
    account: config.user,
    messageId: String(info.messageId ?? ""),
    accepted,
    rejected,
    attachments: [],
  };
}
