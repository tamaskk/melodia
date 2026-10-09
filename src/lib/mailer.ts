/**
 * Levélküldés a saját Gmail-fiókodból, SMTP-n keresztül.
 *
 * Ingyenes: nem kell szolgáltatás, csak egy Google **app-jelszó** (kétlépcsős
 * azonosítás bekapcsolva → https://myaccount.google.com/apppasswords). A jelszó
 * az `atlas-credentials.env`-be kerül, sehova máshova.
 *
 * A napi 15-20 levél messze a Gmail ~500 címzett/napos kerete alatt van.
 */
import { readFile } from "node:fs/promises";
import nodemailer, { type Transporter } from "nodemailer";
import { getAccount, listAccounts, type MailAccount } from "./accounts";
import {
  attachmentsDir,
  listAttachments,
  resolveSelection,
} from "./attachments";
import { credential } from "./env";
import { createLogger } from "./logger";
import type { ContactDoc } from "./types";

const log = createLogger("mailer");

export type MailerConfig = MailAccount;

/** Ide megy az értesítő, ha a küldés magától megáll. */
const ALERT_FALLBACK = "kalman.tamaskrisztian@gmail.com";

/**
 * A levélhez egyetlen csatolmány sem található a küldő gépen — ilyenkor a levél
 * nem megy ki. A hívó ebből tudja, hogy nem múló hiba: a következő címzettnél
 * ugyanez történne, tehát meg kell állni.
 */
export class MissingAttachmentsError extends Error {
  constructor(
    /** A kiválasztott fájlok; üres, ha a teljes mappa ment volna. */
    readonly selected: string[],
    readonly folder: string,
  ) {
    super(
      selected.length
        ? `A kiválasztott csatolmányok (${selected.join(", ")}) közül egy sem található a küldő gépen (${folder}) — csatolmány nélkül nem küldök.`
        : `Nincs csatolható fájl a küldő gép mappájában (${folder}) — csatolmány nélkül nem küldök.`,
    );
    this.name = "MissingAttachmentsError";
  }
}

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

/** Törölt fiók kapcsolatának lezárása — különben a régi jelszóval élne tovább. */
export function forgetTransporter(accountId: string): void {
  transporters.get(accountId)?.close();
  transporters.delete(accountId);
}

/** A bejövő levelek fiókja: IMAP csak Gmailhez van, a Resendnek nincs postafiókja. */
export function inboxConfig(): MailerConfig | null {
  return listAccounts().find((account) => account.provider === "gmail") ?? null;
}

interface Outgoing {
  to: string;
  subject: string;
  text: string;
  files: { filename: string; path: string }[];
  /** Az eredeti levél azonosítója `<…>` alakban, ha szálban megy. */
  reference: string | null;
}

interface Dispatched {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

/** Egy levél a fiók szolgáltatóján át: Gmail SMTP-n, Resend a HTTP API-ján. */
async function dispatch(
  config: MailerConfig,
  mail: Outgoing,
): Promise<Dispatched> {
  if (config.provider === "resend") return dispatchResend(config, mail);

  const info = await getTransporter(config).sendMail({
    from: `${config.fromName} <${config.user}>`,
    to: mail.to,
    ...(config.replyTo ? { replyTo: config.replyTo } : {}),
    subject: mail.subject,
    text: mail.text,
    attachments: mail.files,
    ...(mail.reference
      ? { inReplyTo: mail.reference, references: [mail.reference] }
      : {}),
  });
  return {
    messageId: String(info.messageId ?? ""),
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
  };
}

async function dispatchResend(
  config: MailerConfig,
  mail: Outgoing,
): Promise<Dispatched> {
  const key = credential("RESEND_API_KEY");
  if (!key) {
    throw new Error(
      "Nincs RESEND_API_KEY az atlas-credentials.env fájlban — a Resend-fiókból így nem megy levél.",
    );
  }
  const attachments = await Promise.all(
    mail.files.map(async (file) => ({
      filename: file.filename,
      content: (await readFile(file.path)).toString("base64"),
    })),
  );

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${config.fromName} <${config.user}>`,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      ...(config.replyTo ? { reply_to: config.replyTo } : {}),
      ...(attachments.length ? { attachments } : {}),
      ...(mail.reference
        ? {
            headers: {
              "In-Reply-To": mail.reference,
              References: mail.reference,
            },
          }
        : {}),
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };
  if (!response.ok || !data.id) {
    throw new Error(
      `Resend hiba (${response.status}): ${data.message ?? "ismeretlen hiba"}`,
    );
  }
  return { messageId: data.id, accepted: [mail.to], rejected: [] };
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
  if (config.provider === "resend") {
    // A Resendnél nincs belépés, amit küldés nélkül ki lehetne próbálni.
    return credential("RESEND_API_KEY")
      ? {
          ok: true,
          message: `Resend-kulcs beállítva: ${config.user}. A domaint a próbalevél igazolja.`,
        }
      : {
          ok: false,
          message: "Nincs RESEND_API_KEY az atlas-credentials.env fájlban.",
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
  // Csatolmány nélkül nem megy ki első levél — kivéve, ha a CV-link váltja ki.
  if (!cvUrl && !files.length) {
    throw new MissingAttachmentsError(attachmentKeys ?? [], attachmentsDir());
  }
  const text = cvUrl
    ? `${contact.emailBody}\n\n${contact.language === "hu" ? "Önéletrajzom" : "My CV"}: ${cvUrl}`
    : contact.emailBody;

  const { messageId, accepted, rejected } = await dispatch(config, {
    to: contact.primaryEmail,
    subject: contact.emailSubject,
    text,
    files: files.map((file) => ({
      filename: file.filename,
      path: file.path,
    })),
    reference: null,
  });
  log.info(`levél elküldve: ${contact.company} → ${contact.primaryEmail}`, {
    fiok: config.user,
    messageId,
    csatolmany: files.map((file) => file.filename),
    rejected,
  });

  if (!accepted.length) {
    throw new Error(
      `A szolgáltató nem fogadta el a címzettet: ${rejected.join(", ")}`,
    );
  }

  return {
    account: config.user,
    messageId,
    accepted,
    rejected,
    attachments: files.map((file) => file.filename),
  };
}

/**
 * Értesítő saját magadnak, ha a küldés magától megállt. Ugyanabból a fiókból
 * megy, mint a megállt küldés; a cím az `ALERT_EMAIL` beállítás. Sosem dob:
 * az értesítő hibája nem fedheti el azt, amiről szólna.
 */
export async function sendAlertEmail(
  accountId: string | null | undefined,
  subject: string,
  text: string,
): Promise<void> {
  const config = mailerConfig(accountId);
  const to = credential("ALERT_EMAIL", ALERT_FALLBACK);
  if (!config) {
    log.error(`értesítő nem ment ki (${to}): nincs küldő fiók`);
    return;
  }
  try {
    await dispatch(config, { to, subject, text, files: [], reference: null });
    log.info(`értesítő elküldve: ${to}`, { fiok: config.user, targy: subject });
  } catch (error) {
    log.error(`értesítő nem ment ki (${to}): ${(error as Error).message}`);
  }
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

  const { messageId, accepted, rejected } = await dispatch(config, {
    to: options.to,
    subject: options.subject,
    text: options.body,
    files: [],
    reference,
  });
  log.info(
    `${options.kind ?? "follow-up"} elküldve: ${options.company} → ${options.to}`,
    {
      fiok: config.user,
      messageId,
      szalban: Boolean(reference),
    },
  );
  if (!accepted.length) {
    throw new Error(
      `A szolgáltató nem fogadta el a címzettet: ${rejected.join(", ")}`,
    );
  }
  return {
    account: config.user,
    messageId,
    accepted,
    rejected,
    attachments: [],
  };
}
