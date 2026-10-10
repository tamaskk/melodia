/**
 * A csatolmányok LISTÁJA az adatbázisban — maguk a fájlok nem.
 *
 * A fájlok (CV, ajánlólevél) a küldő gép `attachments/` mappájában maradnak. A
 * telepített példány viszont nem látja azt a mappát, így ott nem lehetne
 * kiválasztani, mi menjen egy queue-val. Ezért a küldő gép közzéteszi a
 * mappa tartalmának jegyzékét (név, méret, nyelv), a telepített példány pedig
 * abból kínál választást.
 */
import { listAttachments } from "./attachments";
import { createLogger } from "./logger";
import { getDb } from "./mongodb";
import { isSender } from "./role";

const log = createLogger("csatolmany");

/**
 * Néző példány: a küldő gép közzétett jegyzékéből olvas, a sajátját nem teszi
 * közzé — különben két gép felváltva írná felül egymásét.
 */
const VIEWER = !isSender();

export interface AttachmentChoice {
  /** Az `attachments/` mappához relatív név — ezzel hivatkozik rá a queue. */
  key: string;
  name: string;
  bytes: number;
  /** "közös", "hu" vagy "en": a nyelvi almappa fájlja csak arra a nyelvre megy. */
  scope: string;
}

export interface AttachmentList {
  files: AttachmentChoice[];
  warning: string | null;
  /** Igaz: a lista a küldő gép közzétett jegyzéke, nem ennek a gépnek a mappája. */
  remote: boolean;
  /** Mikor frissült a jegyzék (csak `remote` esetén). */
  updatedAt: string | null;
}

interface IndexDoc {
  _id: string;
  files: AttachmentChoice[];
  updatedAt: string;
}

async function state() {
  return (await getDb()).collection<IndexDoc>("app_state");
}

/** Ennek a gépnek a mappája: minden fájl egyszer, a nyelvi almappákkal együtt. */
async function localAttachments(): Promise<{
  files: AttachmentChoice[];
  warning: string | null;
}> {
  const [hu, en] = await Promise.all([
    listAttachments("hu"),
    listAttachments("en"),
  ]);
  return {
    files: [
      ...hu.files.map((file) => ({
        key: file.key ?? file.filename,
        name: file.filename,
        bytes: file.bytes,
        scope: file.scope,
      })),
      ...en.files
        .filter((file) => file.scope === "en")
        .map((file) => ({
          key: file.key ?? `en/${file.filename}`,
          name: file.filename,
          bytes: file.bytes,
          scope: file.scope,
        })),
    ],
    warning: hu.warning ?? en.warning,
  };
}

/** A küldő gép közzéteszi a mappája jegyzékét. Néző példányon nem csinál semmit. */
export async function publishAttachments(): Promise<void> {
  if (VIEWER) return;
  try {
    const { files } = await localAttachments();
    await (await state()).updateOne(
      { _id: "attachments" },
      { $set: { files, updatedAt: new Date().toISOString() } },
      { upsert: true },
    );
  } catch (error) {
    // A jegyzék kényelmi adat: a hibája nem akaszthatja meg a küldést.
    log.warn(`a csatolmány-jegyzék közzététele nem sikerült: ${(error as Error).message}`);
  }
}

/** Amiből választani lehet: helyben a mappa, telepített példányon a jegyzék. */
export async function availableAttachments(): Promise<AttachmentList> {
  if (!VIEWER) {
    return { ...(await localAttachments()), remote: false, updatedAt: null };
  }
  const doc = await (await state()).findOne({ _id: "attachments" });
  return {
    files: doc?.files ?? [],
    warning: null,
    remote: true,
    updatedAt: doc?.updatedAt ?? null,
  };
}
