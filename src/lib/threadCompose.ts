/**
 * Kézi levél egy meglévő szálba, egy prompt alapján.
 *
 * A levelezés oldalán megnyitott szálhoz a felhasználó leírja, mit akar
 * írni; a helyi Claude CLI a szál előzményéből megírja, a felhasználó
 * átnézi, és azonnal kimegy — ugyanabba a szálba (`In-Reply-To`), arról a
 * saját fiókról, amelyiken a szál fut. Nem időzít, nem kötődik a napi
 * kerethez: egy levél, kézzel jóváhagyva.
 */
import { askClaude } from "./aiText";
import { resolveSelection } from "./attachments";
import { ensureAccounts, listAccounts } from "./accounts";
import { createLogger } from "./logger";
import { stripQuoted, threadMessages, type MailMessage } from "./mailStore";
import { sendFollowUpEmail } from "./mailer";
import { PROFILE } from "./profile";
import { isNoReply, replySubject } from "./threadReplyDraft";

const log = createLogger("szallevel");

/** Ennyi korábbi levelet kap a modell — a régebbiek csak a promptot hizlalnák. */
const HISTORY = 6;
const PER_MESSAGE = 2500;
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

function history(messages: MailMessage[]): string {
  return messages
    .filter((message) => !message.bounce)
    .slice(-HISTORY)
    .map((message) => {
      const who =
        message.direction === "out"
          ? `Én (${PROFILE.name})`
          : (message.from.name ?? message.from.address);
      const text = stripQuoted(message.text).slice(0, PER_MESSAGE);
      return `--- ${who} · ${message.date.slice(0, 10)}${message.auto ? " · automatikus válasz" : ""}\n${text}`;
    })
    .join("\n\n");
}

export function composePrompt(
  target: ThreadTarget,
  messages: MailMessage[],
  instruction: string,
): string {
  return [
    `Egy álláskereső full stack fejlesztő (${PROFILE.name}) nevében írsz levelet egy meglévő levélszálba.`,
    "",
    `Cég: ${target.company}`,
    `Címzett: ${target.toName ? `${target.toName} <${target.to}>` : target.to}`,
    "",
    "A szál eddig (a legrégebbitől a legújabbig):",
    '"""',
    history(messages),
    '"""',
    "",
    "MIT ÍRJON A LEVÉL (a felhasználó kérése — ez a feladat):",
    '"""',
    instruction.slice(0, 2000),
    '"""',
    "",
    "Szabályok:",
    "- Azon a nyelven írj, amelyiken a szál folyik (ha a kérés mást mond, a kérés dönt).",
    "- Rövid, udvarias, formális (magyarul magázó) hang; hízelgés és mentegetőzés nélkül.",
    "- Ha ismert a címzett neve, őt szólítsd meg; különben a cég csapatát.",
    "- Csak a szálból és a kérésből következő tényekre hivatkozz. Ne találj ki pozíciót, időpontot, számot, korábbi beszélgetést.",
    "- Ne hagyj kitöltendő helyet vagy szögletes zárójelet.",
    "- Ne idézd vissza a korábbi leveleket.",
    `- Az aláírás pontosan ez legyen, külön sorokban: a nyelvnek megfelelő elköszönés, alatta „${PROFILE.name}", alatta „${PROFILE.email} · ${PROFILE.phone}".`,
    "",
    'A válasz kizárólag ez a JSON: {"language": "<kétbetűs kód>", "body": "<a teljes levél szövege, sortörésekkel>"}',
  ].join("\n");
}

export async function draftThreadMail(
  threadId: string,
  instruction: string,
): Promise<ThreadDraft> {
  if (!instruction.trim()) throw new Error("Írd le, miről szóljon a levél.");
  await ensureAccounts();
  const messages = await threadMessages(threadId);
  const target = resolveTarget(threadId, messages);
  const { data, model } = await askClaude(
    composePrompt(target, messages, instruction),
    {
      contactId: target.contactId,
      company: target.company,
      origin: "szallevel",
    },
  );
  const body = typeof data.body === "string" ? data.body.trim() : "";
  if (!body)
    throw new Error("A modell üres levelet adott vissza — próbáld újra.");
  if (/\[[^\]\n]{2,}\]/.test(body)) {
    throw new Error(
      "A piszkozatban kitöltendő hely maradt — pontosítsd a kérést, és generáld újra.",
    );
  }
  const language =
    typeof data.language === "string" && /^[a-z]{2}$/i.test(data.language)
      ? data.language.toLowerCase()
      : null;
  log.info(`piszkozat: ${target.company}`, { model, nyelv: language });
  return { subject: target.subject, body, language, model, target };
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
