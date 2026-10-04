/**
 * Bejövő levelek begyűjtése a Gmailből, IMAP-on.
 *
 * Ugyanaz az app-jelszó, amivel küldünk — nem kell Google Cloud projekt, OAuth
 * és pénz. A kapcsolat **csak olvas**: semmit nem jelöl olvasottnak, nem töröl.
 *
 * A postafiók magánlevelezése nem kerül be az adatbázisba. Egy levél akkor
 * tartozik ide, ha:
 *   1. a "Küldött elemek" mappában egy adatbázisbeli céghez ment (megkeresés),
 *   2. vagy ugyanabban a Gmail-beszélgetésben van, mint egy ilyen megkeresés,
 *   3. vagy a feladó címe/domainje egy megkeresett cégé (más kollégától jövő
 *      válasz is így kerül a helyére).
 */
import { ImapFlow, type FetchMessageObject, type ListResponse } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { credential } from "./env";
import { createLogger } from "./logger";
import { mailerConfig } from "./mailer";
import { getContacts } from "./mongodb";
import {
  mailCollection,
  readMailboxState,
  saveMessages,
  syncContactReplies,
  writeMailboxState,
  type MailAddress,
  type MailMatch,
  type MailMessage,
} from "./mailStore";

const log = createLogger("inbox");

/** Ezekre a domainekre nem általánosítunk: túl sok magánlevél jönne be velük. */
const FREEMAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "freemail.hu",
  "citromail.hu",
  "indamail.hu",
  "t-online.hu",
  "vipmail.hu",
]);

export interface SyncState {
  status: "idle" | "running" | "done" | "error";
  phase: string | null;
  scanned: number;
  added: number;
  threads: number;
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
  /** Automatikus szinkron ütemezése percben (0 = nincs). */
  autoEveryMinutes: number;
}

/**
 * Közös állapot a `globalThis`-en: az automatikus ütemező (instrumentation) és
 * a kézi gomb (API-route) külön modulpéldányban futhat — modulváltozóval két
 * állapot lenne, és két szinkron mehetne egyszerre.
 */
const shared = globalThis as typeof globalThis & {
  __melodiaSync?: {
    state: SyncState;
    running: Promise<void> | null;
    timer: NodeJS.Timeout | null;
  };
};
const sync = (shared.__melodiaSync ??= {
  state: {
    status: "idle",
    phase: null,
    scanned: 0,
    added: 0,
    threads: 0,
    startedAt: null,
    finishedAt: null,
    message: null,
    autoEveryMinutes: 0,
  },
  running: null,
  timer: null,
});
const state = sync.state;

export function syncState(): SyncState {
  return { ...state };
}

export function isInboxReady(): boolean {
  return mailerConfig() !== null;
}

function domainOf(address: string): string {
  return address.split("@")[1]?.toLowerCase() ?? "";
}

function addressList(
  value: AddressObject | AddressObject[] | undefined,
): MailAddress[] {
  if (!value) return [];
  const groups = Array.isArray(value) ? value : [value];
  return groups
    .flatMap((group) => group.value)
    .filter((item) => item.address)
    .map((item) => ({
      name: item.name?.trim() || null,
      address: item.address!.toLowerCase(),
    }));
}

function textOf(parsed: ParsedMail): string {
  if (parsed.text?.trim()) return parsed.text.trim();
  if (typeof parsed.html === "string") {
    // Sok cég HTML-ben válaszol; a puszta szöveg is elég a listához.
    return parsed.html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return "";
}

/** Robotválasz-e: szabadságon, automatikus visszajelzés, jelentkezés-visszaigazolás. */
function isAuto(parsed: ParsedMail): boolean {
  const headers = parsed.headers;
  const submitted = String(headers.get("auto-submitted") ?? "").toLowerCase();
  if (submitted && submitted !== "no") return true;
  if (headers.has("x-autoreply") || headers.has("x-autorespond")) return true;
  const precedence = String(headers.get("precedence") ?? "").toLowerCase();
  if (["auto_reply", "bulk", "junk"].includes(precedence)) return true;
  return /(out of office|automatic reply|autoreply|automatikus válasz|távollét|szabadságon)/i.test(
    parsed.subject ?? "",
  );
}

/**
 * Körlevél-e a feladó. Csak a domain-egyezésnél számít: a megkeresett cég
 * domainjéről a válasz mellett állásértesítő és hírlevél is érkezik, az pedig
 * nem tartozik ide. A saját szálunkban érkező levelet ez nem érinti.
 *
 * Szándékosan a feladót nézzük, nem a tárgyat: a válaszok tárgya nyelvenként
 * bármi lehet ("Ihre Bewerbung", "Rückmeldung", "Sikeresen megérkeztek az
 * adataid"), a körlevelet viszont elárulja a küldő postafiók neve.
 */
const BULK_SENDER =
  /^(allasertesito|allasajanlat|hirlevel|newsletter|news|noreply|no-reply|donotreply|do-not-reply|mailer|marketing|promo|promotions|notification|notifications|alerts?|updates?|digest|community|social)([.\-_]|@|$)/i;

function isBulkSender(address: string): boolean {
  return BULK_SENDER.test(address.split("@")[0] ?? "");
}

/**
 * A tárgy a jelentkezésre utal-e. Ez menti meg azokat a "do-not-reply" címről
 * jövő válaszokat, amelyek valójában a pályázatomra érkeztek. A saját nevem
 * szándékosan nincs a listán: a hírlevelek is megszólítanak névre.
 */
const REPLY_SUBJECT =
  /(re:|fwd:|jelentkez|pályáz|palyaz|önéletraj|oneletraj|interj|interview|application|applicant|resume|\bcv\b|visszajelz|megkaptuk|bewerbung|bewerben|rückmeldung|ruckmeldung|antwort|absage|automatic reply|automatikus válasz|out of office)/i;

function looksLikeReply(
  subject: string,
  inReplyTo: string | undefined | null,
): boolean {
  return Boolean(inReplyTo) || REPLY_SUBJECT.test(subject);
}

function isBounce(from: MailAddress | null, subject: string): boolean {
  if (
    from &&
    /mailer-daemon|postmaster|no-?reply@.*(mail|smtp)/i.test(from.address)
  ) {
    return true;
  }
  return /(delivery status notification|undelivered mail|delivery has failed|address not found|kézbesítési hiba)/i.test(
    subject,
  );
}

interface ContactHit {
  _id: string;
  company: string;
  address: string;
}

/** Melyik címhez tartozik adatbázisbeli cég. Egy kérdés, több cím. */
async function matchContacts(
  addresses: string[],
): Promise<Map<string, ContactHit>> {
  const unique = [...new Set(addresses.filter(Boolean))];
  const found = new Map<string, ContactHit>();
  if (!unique.length) return found;

  const contacts = await getContacts();
  // Nagy listát darabolva kérdezünk: egy több ezer elemű $in az Atlas M0-n
  // elfogy az időből.
  const docs = [];
  for (let start = 0; start < unique.length; start += 400) {
    const slice = unique.slice(start, start + 400);
    docs.push(
      ...(await contacts
        .find(
          {
            $or: [{ primaryEmail: { $in: slice } }, { emails: { $in: slice } }],
          },
          { projection: { company: 1, primaryEmail: 1, emails: 1 } },
        )
        .toArray()),
    );
  }

  for (const doc of docs) {
    const own = [doc.primaryEmail, ...(doc.emails ?? [])]
      .filter(Boolean)
      .map((address) => String(address).toLowerCase());
    for (const address of own) {
      if (!unique.includes(address) || found.has(address)) continue;
      found.set(address, {
        _id: String(doc._id),
        company: doc.company,
        address,
      });
    }
  }
  return found;
}

/** Mit tudunk már: mely szálakat követjük, és mely cégdomainekkel leveleztünk. */
async function knownContext(): Promise<{
  threads: Set<string>;
  domains: Set<string>;
}> {
  const collection = await mailCollection();
  const [threads, counterparts] = await Promise.all([
    collection.distinct("threadId"),
    collection.distinct("counterpart"),
  ]);
  const domains = new Set<string>();
  for (const address of counterparts) {
    const domain = domainOf(String(address));
    if (domain && !FREEMAIL.has(domain)) domains.add(domain);
  }
  return { threads: new Set(threads.map(String)), domains };
}

function connect(user: string, password: string): ImapFlow {
  return new ImapFlow({
    host: credential("GMAIL_IMAP_HOST", "imap.gmail.com"),
    port: Number(credential("GMAIL_IMAP_PORT", "993")),
    secure: true,
    auth: { user, pass: password },
    logger: false,
    // A Gmail bontja a tétlen kapcsolatot; rövid műveletekhez ez bőven elég.
    socketTimeout: 120_000,
  });
}

/** A "Küldött elemek" mappa neve fiókonként/nyelvenként más — a jelöléséből találjuk meg. */
function findMailbox(
  list: ListResponse[],
  flag: string,
  fallback: string,
): string {
  const hit = list.find(
    (item) => item.specialUse === flag || item.flags?.has(flag),
  );
  return hit?.path ?? fallback;
}

interface ScanResult {
  /** Amit érdemes letölteni: uid → miért. */
  wanted: Map<number, { match: MailMatch; contact: ContactHit | null }>;
  maxUid: number;
  scanned: number;
  envelopes: Map<number, FetchMessageObject>;
}

const MAX_TEXT = 20_000;

/**
 * Egy mappa átnézése: előbb csak a borítékokat kérjük le (olcsó), és csak a
 * megtartandó levelek teljes szövegét töltjük le.
 */
async function scanMailbox(
  client: ImapFlow,
  path: string,
  since: Date,
  /** Egyszerre kapja meg az összes borítékot: egy adatbázis-kérdés, nem ezer. */
  decide: (
    envelopes: FetchMessageObject[],
  ) => Promise<Map<number, { match: MailMatch; contact: ContactHit | null }>>,
): Promise<ScanResult> {
  const lock = await client.getMailboxLock(path, { readOnly: true });
  const result: ScanResult = {
    wanted: new Map(),
    maxUid: 0,
    scanned: 0,
    envelopes: new Map(),
  };

  try {
    const mailbox = client.mailbox;
    if (!mailbox || typeof mailbox === "boolean") return result;

    const uidValidity = String(mailbox.uidValidity);
    const saved = await readMailboxState(path);
    const fresh = !saved || saved.uidValidity !== uidValidity;

    // Folytatás a legutóbbi uid után; első alkalommal (vagy ha a Gmail
    // újraszámozta a mappát) a megadott naptól nézünk végig mindent.
    const range = fresh ? null : `${saved.lastUid + 1}:*`;
    // A keresés `false`-t ad vissza, ha a szerver nem tudta végrehajtani.
    const found = fresh ? await client.search({ since }, { uid: true }) : null;
    const uids = Array.isArray(found) ? found : [];

    if (fresh && !uids.length) return result;

    log.info(
      `${path}: ${fresh ? `első átnézés ${since.toISOString().slice(0, 10)} óta` : `folytatás uid ${saved!.lastUid + 1}-től`}`,
    );

    const envelopes: FetchMessageObject[] = [];
    for await (const message of client.fetch(
      fresh ? uids : range!,
      { envelope: true, threadId: true, size: true },
      { uid: true },
    )) {
      result.scanned += 1;
      result.maxUid = Math.max(result.maxUid, message.uid);
      state.scanned += 1;
      envelopes.push(message);
      result.envelopes.set(message.uid, message);
    }

    result.wanted = await decide(envelopes);
    for (const uid of result.envelopes.keys()) {
      if (!result.wanted.has(uid)) result.envelopes.delete(uid);
    }

    await writeMailboxState({
      path,
      uidValidity,
      lastUid: Math.max(result.maxUid, saved?.lastUid ?? 0),
      syncedAt: new Date().toISOString(),
    });
  } finally {
    lock.release();
  }

  return result;
}

/** A kiválasztott levelek letöltése és tárolható alakra hozása. */
async function download(
  client: ImapFlow,
  path: string,
  scan: ScanResult,
  direction: "in" | "out",
  ownAddress: string,
): Promise<MailMessage[]> {
  if (!scan.wanted.size) return [];

  const lock = await client.getMailboxLock(path, { readOnly: true });
  const out: MailMessage[] = [];

  try {
    const mailbox = client.mailbox;
    const uidValidity =
      mailbox && typeof mailbox !== "boolean"
        ? String(mailbox.uidValidity)
        : "0";

    for await (const message of client.fetch(
      [...scan.wanted.keys()],
      { source: true, envelope: true, threadId: true },
      { uid: true },
    )) {
      const verdict = scan.wanted.get(message.uid);
      if (!verdict || !message.source) continue;

      const parsed = await simpleParser(message.source);

      // Hírlevél, állásértesítő, körlevél: a cég domainjéről jön, de nem
      // válasz a jelentkezésre. A leiratkozó fejléc árulja el. A már követett
      // szálban érkező levelet ez nem érinti.
      const bulk =
        parsed.headers.has("list-unsubscribe") || parsed.headers.has("list-id");
      if (
        direction === "in" &&
        bulk &&
        !parsed.inReplyTo &&
        verdict.match !== "szal"
      ) {
        continue;
      }

      const from = addressList(parsed.from)[0] ?? null;
      const to = addressList(parsed.to);
      const cc = addressList(parsed.cc);
      const subject = parsed.subject?.trim() ?? "";
      const text = textOf(parsed).slice(0, MAX_TEXT);

      // A "másik fél": kimenő levélnél a címzett, bejövőnél a feladó.
      const counterpart =
        verdict.contact?.address ??
        (direction === "out"
          ? (to.find((item) => item.address !== ownAddress)?.address ?? "")
          : (from?.address ?? ""));

      out.push({
        key: `${uidValidity}:${path}:${message.uid}`,
        mailbox: path,
        uid: message.uid,
        uidValidity,
        threadId: String(message.threadId ?? parsed.messageId ?? message.uid),
        messageId: parsed.messageId ?? null,
        direction,
        from: from ?? { name: null, address: ownAddress },
        to: [...to, ...cc],
        subject,
        date: (parsed.date ?? new Date()).toISOString(),
        text,
        snippet: text.replace(/\s+/g, " ").slice(0, 220),
        attachments: (parsed.attachments ?? [])
          .map((file) => file.filename ?? "")
          .filter(Boolean),
        counterpart,
        contactId: verdict.contact?._id ?? null,
        company: verdict.contact?.company ?? null,
        bounce: direction === "in" && isBounce(from, subject),
        auto: direction === "in" && isAuto(parsed),
        matchedBy: verdict.match,
        createdAt: new Date().toISOString(),
      });
    }
  } finally {
    lock.release();
  }

  return out;
}

async function run(days: number): Promise<void> {
  const config = mailerConfig();
  if (!config)
    throw new Error("Nincs Gmail-hozzáférés: GMAIL_USER / GMAIL_APP_PASSWORD.");

  const own = config.user.toLowerCase();
  const since = new Date(Date.now() - days * 86_400_000);
  const client = connect(config.user, config.password);

  await client.connect();
  log.info("IMAP kapcsolat él", { user: own, napok: days });

  try {
    const list = await client.list();
    const sentPath = findMailbox(list, "\\Sent", "[Gmail]/Sent Mail");
    const context = await knownContext();

    // 1. Küldött levelek: melyik ment adatbázisbeli céghez.
    state.phase = "küldött levelek átnézése";
    const sentScan = await scanMailbox(
      client,
      sentPath,
      since,
      async (envelopes) => {
        const recipientsOf = (message: FetchMessageObject) =>
          [...(message.envelope?.to ?? []), ...(message.envelope?.cc ?? [])]
            .map((item) => item.address?.toLowerCase() ?? "")
            .filter(Boolean);

        const hits = await matchContacts(envelopes.flatMap(recipientsOf));
        const verdicts = new Map<
          number,
          { match: MailMatch; contact: ContactHit | null }
        >();

        for (const message of envelopes) {
          const hit = recipientsOf(message)
            .map((address) => hits.get(address))
            .find(Boolean);
          if (hit) {
            verdicts.set(message.uid, { match: "cim", contact: hit });
            continue;
          }
          // A saját válaszom egy már követett szálban: a címzett nincs a DB-ben
          // (pl. más kolléga válaszolt), de a beszélgetést már ismerjük.
          const threadId = message.threadId ? String(message.threadId) : null;
          if (threadId && context.threads.has(threadId)) {
            verdicts.set(message.uid, { match: "szal", contact: null });
          }
        }
        return verdicts;
      },
    );

    state.phase = "küldött levelek letöltése";
    const sentMessages = await download(client, sentPath, sentScan, "out", own);
    for (const message of sentMessages) {
      context.threads.add(message.threadId);
      const domain = domainOf(message.counterpart);
      if (domain && !FREEMAIL.has(domain)) context.domains.add(domain);
    }

    // 2. Beérkezők: ami ezekre a szálakra vagy ezektől a cégektől jön.
    state.phase = "beérkező levelek átnézése";
    const inboxScan = await scanMailbox(
      client,
      "INBOX",
      since,
      async (envelopes) => {
        const senderOf = (message: FetchMessageObject) =>
          message.envelope?.from?.[0]?.address?.toLowerCase() ?? "";

        const hits = await matchContacts(envelopes.map(senderOf));
        const verdicts = new Map<
          number,
          { match: MailMatch; contact: ContactHit | null }
        >();

        for (const message of envelopes) {
          const threadId = message.threadId ? String(message.threadId) : null;
          if (threadId && context.threads.has(threadId)) {
            verdicts.set(message.uid, { match: "szal", contact: null });
            continue;
          }
          const from = senderOf(message);
          if (!from) continue;

          const hit = hits.get(from);
          if (hit) {
            verdicts.set(message.uid, { match: "cim", contact: hit });
            continue;
          }
          const domain = domainOf(from);
          // A cég domainjéről érkezett: elfogadjuk, hacsak nem körlevélküldő
          // postafiókról jön — és onnan is csak akkor, ha a tárgy szerint mégis
          // a jelentkezésemre válaszol.
          const bulkSender =
            isBulkSender(from) &&
            !looksLikeReply(
              message.envelope?.subject ?? "",
              message.envelope?.inReplyTo,
            );
          if (domain && context.domains.has(domain) && !bulkSender) {
            verdicts.set(message.uid, { match: "domain", contact: null });
          }
        }
        return verdicts;
      },
    );

    state.phase = "beérkező levelek letöltése";
    const inboxMessages = await download(client, "INBOX", inboxScan, "in", own);

    const added = await saveMessages([...sentMessages, ...inboxMessages]);
    state.added = added;
    state.threads = new Set(
      [...sentMessages, ...inboxMessages].map((message) => message.threadId),
    ).size;
    state.message =
      added > 0
        ? `${added} új levél (${state.threads} szálban).`
        : "Nincs új levél a megkeresésekhez.";
    log.info(
      `kész: ${state.scanned} levél átnézve, ${added} új mentve ` +
        `(küldött: ${sentMessages.length}, beérkező: ${inboxMessages.length})`,
    );

    // A válaszok és visszapattanások vissza a kontaktokra — a lista státusza
    // (Válaszolt / Visszapattant) és a válaszarány ebből számol.
    state.phase = "státuszok frissítése a kontaktokon";
    const replies = await syncContactReplies();
    log.info(
      `kontakt-státusz: ${replies.replied} válaszolt, ${replies.bounced} visszapattant, ` +
        `${replies.markedSent} pótlólag elküldöttnek jelölve (${replies.contacts} kontakt levelezéssel)`,
    );

    // Az új válaszok osztályozása és a válaszpiszkozat (replyTriage.ts).
    state.phase = "új válaszok osztályozása";
    try {
      const { triagePending } = await import("./replyTriage");
      const triage = await triagePending();
      if (triage.triaged) {
        log.info(
          `válaszok: ${triage.triaged} osztályozva, ${triage.outcomes} kimenetel magától`,
        );
      }
    } catch (error) {
      log.warn(`válasz-osztályozás kimaradt: ${(error as Error).message}`);
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** Begyűjtés indítása. A kérés nem várja meg — az állapotot lekérdezheted. */
export function startSync(
  days = Number(credential("MAIL_SYNC_DAYS", "180")),
): SyncState {
  if (state.status === "running") return syncState();

  Object.assign(state, {
    status: "running",
    phase: "kapcsolódás",
    scanned: 0,
    added: 0,
    threads: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: null,
  } satisfies Partial<SyncState>);

  sync.running = run(days)
    .then(() => {
      state.status = "done";
    })
    .catch((error: Error) => {
      state.status = "error";
      state.message = /invalid credentials|authenticationfailed/i.test(
        error.message,
      )
        ? "A Gmail elutasította a belépést. Ugyanaz az app-jelszó kell, mint a küldéshez, " +
          "és az IMAP-nak engedélyezve kell lennie a fiókban."
        : error.message;
      log.error("begyűjtés hiba", state.message);
    })
    .finally(() => {
      state.phase = null;
      state.finishedAt = new Date().toISOString();
      sync.running = null;
    });

  return syncState();
}

/** Teszthez: megvárja a futó begyűjtést. */
export function syncPromise(): Promise<void> | null {
  return sync.running;
}

/**
 * Automatikus szinkron: indulás után 1 perccel, aztán `MAIL_AUTO_SYNC_MINUTES`
 * percenként (alap 30, 0 = ki). Csak az új leveleket húzza le (uid-tól), és a
 * végén a válaszok a kontaktokra is visszaíródnak — így a Teendők friss.
 * Vercelen nem fut: ott nincs hosszan élő folyamat.
 */
export function startAutoSync(): number {
  const minutes = Math.max(
    0,
    Number(credential("MAIL_AUTO_SYNC_MINUTES", "30")) || 0,
  );
  if (!minutes || process.env.VERCEL || !isInboxReady()) return 0;
  state.autoEveryMinutes = minutes;
  if (sync.timer) return minutes;

  const tick = () => {
    if (state.status === "running") return;
    log.info("automatikus szinkron indul");
    startSync();
  };
  sync.timer = setInterval(tick, minutes * 60_000);
  setTimeout(tick, 60_000);
  return minutes;
}
