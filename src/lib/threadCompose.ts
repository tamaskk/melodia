/**
 * Kézi levél egy meglévő szálba, egy prompt alapján.
 *
 * A levelezés oldalán megnyitott szálhoz a helyi LLM az alap válasz-prompttal
 * és a felhasználó kiegészítő utasításával megírja, a felhasználó átnézi, és
 * azonnal kimegy — ugyanabba a szálba (`In-Reply-To`), arról a
 * saját fiókról, amelyiken a szál fut. Nem időzít, nem kötődik a napi
 * kerethez: egy levél, kézzel jóváhagyva.
 */
import { resolveSelection } from "./attachments";
import { ensureAccounts, listAccounts } from "./accounts";
import { createLogger } from "./logger";
import { threadMessages, type MailMessage } from "./mailStore";
import { sendFollowUpEmail } from "./mailer";
import { getReplyAttachments, replyAttachmentFor } from "./replyAttachments";
import { generateReplyDraft } from "./replyLlm";
import { isNoReply, replySubject } from "./threadReplyDraft";

const log = createLogger("szallevel");

/** Automatikus válasz előtagja a tárgyban — a mi levelünkre ne ezzel feleljünk. */
const AUTO_PREFIX =
  /^\s*(automatikus válasz|automatic reply|auto(matische antwort)?|out of office|abwesenheitsnotiz)\s*:\s*/i;

export interface ThreadTarget {
  threadId: string;
  company: string;
  contactId: string | null;
  accountId: string;
  account: string;
  to: string;
  toName: string | null;
  subject: string;
  inReplyTo: string | null;
}

export interface ThreadDraft {
  subject: string;
  body: string;
  language: string | null;
  model: string;
  /** A nyelvhez a Beállításokban választott csatolmány, ha megvan a mappában. */
  attachments: string[];
  target: ThreadTarget;
}

/**
 * Kinek, honnan, mire: a másik fél címe, a saját fiók, amelyiken a szál fut,
 * és az utolsó levél azonosítója, amihez fűzzük.
 */
function resolveTarget(
  threadId: string,
  messages: MailMessage[],
): ThreadTarget {
  if (!messages.length) throw new Error("Ez a szál nincs meg.");
  const accounts = listAccounts();
  const own = new Set(accounts.map((item) => item.user.toLowerCase()));

  // A saját fiók: amelyikről a szálban levél ment, vagy amelyikre jött.
  const latest = [...messages].reverse();
  const accountUser =
    latest
      .flatMap((message) =>
        message.direction === "out"
          ? [message.from.address]
          : message.to.map((item) => item.address),
      )
      .map((address) => address.toLowerCase())
      .find((address) => own.has(address)) ??
    latest
      .map((message) => message.account?.toLowerCase())
      .find((address): address is string => !!address && own.has(address));
  const account = accounts.find(
    (item) => item.user.toLowerCase() === accountUser,
  );
  if (!account) {
    throw new Error(
      "Nem találom a saját fiókot, amelyiken ez a szál fut — nézd meg a Küldő fiókok oldalon, be van-e állítva.",
    );
  }

  // Emberi válasz címére megy, ha van; különben annak, akinek mi írtunk.
  // Emberi válasz feladója; ha csak automatikus jött (pl. házon kívül), annak
  // a feladója; különben akinek mi írtunk; végül a szál névjegye.
  const incoming = latest.filter(
    (message) =>
      message.direction === "in" &&
      !message.bounce &&
      !isNoReply(message.from.address),
  );
  const replier =
    incoming.find((message) => !message.auto) ?? incoming[0] ?? null;
  const firstOut = messages.find((message) => message.direction === "out");
  const to =
    replier?.from.address ??
    firstOut?.to[0]?.address ??
    messages.find((message) => message.counterpart)?.counterpart ??
    null;
  if (!to) throw new Error("Nem tudom, kinek menjen a levél ebben a szálban.");
  if (isNoReply(to)) {
    throw new Error(`Robotcím (${to}) — arra nincs értelme levelet küldeni.`);
  }
  const toName = replier?.from.name ?? firstOut?.to[0]?.name ?? null;

  const anchor = latest.find((message) => !message.bounce && message.messageId);
  const owner = messages.find((message) => message.company);
  return {
    threadId,
    company: owner?.company ?? messages[0].counterpart ?? to,
    contactId: messages.find((message) => message.contactId)?.contactId ?? null,
    accountId: account.id,
    account: account.user,
    to: to.toLowerCase(),
    toName,
    subject: replySubject(
      (firstOut ?? messages[0]).subject.replace(AUTO_PREFIX, ""),
    ),
    inReplyTo: anchor?.messageId ?? null,
  };
}

export async function threadTarget(threadId: string): Promise<ThreadTarget> {
  await ensureAccounts();
  return resolveTarget(threadId, await threadMessages(threadId));
}

export async function draftThreadMail(
  threadId: string,
  instruction: string,
): Promise<ThreadDraft> {
  await ensureAccounts();
  const messages = await threadMessages(threadId);
  const target = resolveTarget(threadId, messages);
  const draft = await generateReplyDraft({
    company: target.company,
    senderName: target.toName,
    messages,
    styleExamples: [],
    instruction: instruction.slice(0, 2000),
    // A nyelv még nem dől el: ha valamelyik nyelvhez van beállított fájl, megy.
    withAttachment: Object.values(await getReplyAttachments()).some(Boolean),
  });
  const name = await replyAttachmentFor(draft.language);
  const { files } = name ? await resolveSelection([name]) : { files: [] };
  log.info(`piszkozat: ${target.company}`, {
    model: draft.model,
    nyelv: draft.language,
  });
  return {
    subject: target.subject,
    body: draft.body,
    language: draft.language,
    model: draft.model,
    attachments: files.length && name ? [name] : [],
    target,
  };
}

export async function sendThreadMail(
  threadId: string,
  mail: { subject: string; body: string; attachments: string[] },
): Promise<{
  account: string;
  to: string;
  messageId: string | null;
  attachments: string[];
}> {
  const subject = mail.subject.trim();
  const body = mail.body.trim();
  if (!subject || !body) throw new Error("A tárgy és a szöveg sem lehet üres.");

  const target = await threadTarget(threadId);
  const { files } = await resolveSelection(mail.attachments);
  if (files.length < mail.attachments.length) {
    throw new Error(
      "Hiányzik egy kiválasztott csatolmány az attachments/ mappából — nem küldtem el nélküle.",
    );
  }
  const result = await sendFollowUpEmail({
    accountId: target.accountId,
    to: target.to,
    company: target.company,
    subject,
    body,
    inReplyTo: target.inReplyTo,
    kind: "levél a szálba",
    files,
  });
  return {
    account: result.account,
    to: target.to,
    messageId: result.messageId,
    attachments: result.attachments,
  };
}
