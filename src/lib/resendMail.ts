/**
 * A Resend-fiókból kiment levelek a levelezésben.
 *
 * A Resendnek nincs postafiókja, amit be lehetne olvasni, ezért a kimenő
 * leveleit a kontakt soráról vesszük fel: ott van, mi ment ki, mikor és milyen
 * azonosítóval. A válasz egy Gmail-postafiókba érkezik — azt a rendes
 * begyűjtés hozza be, itt csak összekötjük a kimenő levéllel egy szálba.
 */
import { listAccounts } from "./accounts";
import { credential } from "./env";
import { createLogger } from "./logger";
import {
  invalidateThreadCache,
  mailCollection,
  saveMessages,
  type MailMessage,
} from "./mailStore";
import { getContacts } from "./mongodb";

const log = createLogger("resend-levelek");

const KEY = "resend:";

/** A kimenő levél tárolható alakja a kontakt sorából. */
export function resendMessage(
  contact: {
    _id: string;
    company: string;
    primaryEmail: string;
    emailSubject: string;
    emailBody: string;
    sentAt: string;
    sentMessageId: string;
  },
  account: { user: string; fromName: string },
  now: string,
): MailMessage {
  const key = `${KEY}${contact.sentMessageId}`;
  const own = account.user.toLowerCase();
  const to = contact.primaryEmail.toLowerCase();
  return {
    key,
    mailbox: "resend",
    account: own,
    uid: 0,
    uidValidity: "resend",
    // Saját szál, amíg válasz nem jön rá — akkor a válasz szálába kerül.
    threadId: key,
    messageId: contact.sentMessageId,
    direction: "out",
    from: { name: account.fromName, address: own },
    to: [{ name: null, address: to }],
    subject: contact.emailSubject,
    date: contact.sentAt,
    text: contact.emailBody,
    snippet: contact.emailBody.replace(/\s+/g, " ").slice(0, 220),
    attachments: [],
    counterpart: to,
    contactId: contact._id,
    company: contact.company,
    bounce: false,
    auto: false,
    matchedBy: "cim",
    createdAt: now,
  };
}

/**
 * A még fel nem vett kimenő levelek pótlása, és a válaszok összekötése.
 * Ismételhető: ami már bent van, azt nem írja újra.
 */
export async function syncResendSent(): Promise<{
  added: number;
  linked: number;
}> {
  const accounts = listAccounts().filter(
    (account) => account.provider === "resend",
  );
  if (!accounts.length) return { added: 0, linked: 0 };

  const mail = await mailCollection();
  const contacts = await getContacts();
  const known = (
    await mail
      .find({ mailbox: "resend" }, { projection: { _id: 0, messageId: 1 } })
      .toArray()
  ).map((message) => message.messageId);

  let added = 0;
  const now = new Date().toISOString();
  for (const account of accounts) {
    const rows = await contacts
      .find(
        {
          sent: true,
          sentFrom: account.user,
          sentAt: { $ne: null },
          primaryEmail: { $ne: null },
          sentMessageId: { $nin: [...known, null] },
        } as never,
        {
          projection: {
            company: 1,
            primaryEmail: 1,
            emailSubject: 1,
            emailBody: 1,
            sentAt: 1,
            sentMessageId: 1,
          },
        },
      )
      .toArray();
    added += await saveMessages(
      rows.map((row) =>
        resendMessage(
          {
            ...(row as never as Parameters<typeof resendMessage>[0]),
            _id: String(row._id),
          },
          account,
          now,
        ),
      ),
    );
  }

  // Összekötés: ha a kontakttól már jött levél, a kimenő levél annak a
  // szálába kerül, a szál levelei pedig ehhez a fiókhoz számítanak.
  const loose = await mail
    .find(
      { mailbox: "resend", threadId: { $regex: `^${KEY}` } },
      { projection: { _id: 0, key: 1, contactId: 1, account: 1, date: 1 } },
    )
    .toArray();
  const byContact = new Map(
    loose
      .filter((message) => message.contactId)
      .map((message) => [message.contactId as string, message]),
  );
  let linked = 0;
  if (byContact.size) {
    const incoming = await mail
      .find(
        { contactId: { $in: [...byContact.keys()] }, direction: "in" },
        { projection: { _id: 0, contactId: 1, threadId: 1, date: 1 } },
      )
      .sort({ date: 1 })
      .toArray();
    const done = new Set<string>();
    for (const reply of incoming) {
      const sent = byContact.get(reply.contactId as string);
      if (!sent || done.has(sent.key) || reply.date < sent.date) continue;
      done.add(sent.key);
      await mail.updateOne(
        { key: sent.key },
        { $set: { threadId: reply.threadId } },
      );
      await mail.updateMany(
        { threadId: reply.threadId },
        { $set: { account: sent.account } },
      );
      linked += 1;
    }
  }

  const bounced = await syncResendDelivery().catch((error: Error) => {
    log.warn(`a Resend kézbesítési állapota kimaradt: ${error.message}`);
    return 0;
  });
  if (linked || bounced) invalidateThreadCache();
  if (added || linked) {
    log.info(
      `Resend: ${added} kimenő levél felvéve, ${linked} válasz összekötve`,
    );
  }
  return { added, linked };
}

/** Egy oldal a Resend kiküldött leveleiből — csak az azonosító és az állapot kell. */
interface ResendPage {
  data?: { id: string; last_event?: string }[];
  has_more?: boolean;
  message?: string;
}

/** Legfeljebb ennyi oldalt kérünk le egy körben (oldalanként 100 levél). */
const MAX_PAGES = 20;

/**
 * A levelek kézbesítési állapota a Resendtől: ami visszapattant, az a
 * levelezésben is visszapattantként látszik. Visszaadja, hány levél állapota
 * változott visszapattantra.
 */
async function syncResendDelivery(): Promise<number> {
  const key = credential("RESEND_API_KEY");
  if (!key) return 0;

  const events = new Map<string, string>();
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response: Response = await fetch(
      `https://api.resend.com/emails?limit=100${after ? `&after=${after}` : ""}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    const body = (await response.json().catch(() => ({}))) as ResendPage;
    if (!response.ok) {
      throw new Error(
        `Resend hiba (${response.status}): ${body.message ?? "ismeretlen hiba"}`,
      );
    }
    for (const email of body.data ?? []) {
      if (email.last_event) events.set(email.id, email.last_event);
    }
    after = body.data?.at(-1)?.id ?? null;
    if (!body.has_more || !after) break;
  }

  const mail = await mailCollection();
  const stored = await mail
    .find(
      { mailbox: "resend" },
      { projection: { _id: 0, key: 1, messageId: 1, delivery: 1 } },
    )
    .toArray();
  let bounced = 0;
  for (const message of stored) {
    const event = message.messageId ? events.get(message.messageId) : null;
    if (!event || event === message.delivery) continue;
    const isBounce = event === "bounced";
    await mail.updateOne(
      { key: message.key },
      { $set: { delivery: event, bounce: isBounce } },
    );
    if (isBounce) bounced += 1;
  }
  if (bounced) log.info(`Resend: ${bounced} levél visszapattant`);
  return bounced;
}
