/**
 * Válaszlevélhez nyelvenként melyik csatolmány megy (Beállítások menü).
 * Mongóban él, hogy a küldő gép és a telepített példány ugyanazt lássa.
 */
import {
  availableAttachments,
  localAttachments,
  type AttachmentChoice,
} from "./attachmentIndex";
import { getDb } from "./mongodb";

export type ReplyLanguage = "hu" | "en";
/** Az `attachments/` mappához relatív kulcs nyelvenként; `null`: nincs csatolmány. */
export type ReplyAttachments = Record<ReplyLanguage, string | null>;

/** Amíg senki nem állította be: a korábbi, kódba írt választás. */
const DEFAULTS: ReplyAttachments = {
  hu: "hu/kt_bemutatkozo.pdf",
  en: "en/kt_introduce.pdf",
};

interface SettingDoc extends ReplyAttachments {
  _id: string;
}

async function state() {
  return (await getDb()).collection<SettingDoc>("app_state");
}

export async function getReplyAttachments(): Promise<ReplyAttachments> {
  const doc = await (await state()).findOne({ _id: "reply_attachments" });
  return doc ? { hu: doc.hu ?? null, en: doc.en ?? null } : DEFAULTS;
}

export async function setReplyAttachments(
  value: ReplyAttachments,
): Promise<void> {
  await (await state()).updateOne(
    { _id: "reply_attachments" },
    { $set: { hu: value.hu, en: value.en } },
    { upsert: true },
  );
}

/**
 * Amiből választani lehet. A piszkozatot az a gép írja, amelyiken a Válasz-ház
 * fut, a saját mappájából — ezért itt a helyi mappa számít, nem a küldő gép
 * jegyzéke. A telepített példány nem ír piszkozatot, ott marad a jegyzék.
 */
export async function replyAttachmentChoices(): Promise<AttachmentChoice[]> {
  return process.env.VERCEL
    ? (await availableAttachments()).files
    : (await localAttachments()).files;
}

/** Magyar válaszhoz a magyar, minden máshoz az angol beállítás. */
export async function replyAttachmentFor(
  language: string | null,
): Promise<string | null> {
  return (await getReplyAttachments())[language === "hu" ? "hu" : "en"];
}
