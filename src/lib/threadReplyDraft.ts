/**
 * Időzített válasz egy meglévő szálba — a tiszta rész: a piszkozat promptja,
 * a tárgy, a robotcímek kiszűrése és a napi szabad hely kiszámítása.
 *
 * Jellemzően elutasítás után megy: „sajnálom, hogy most nincs lehetőség; ha
 * később nyílik valami, szívesen veszem a megkeresést" — és mellé egy
 * bemutatkozó PDF. Adatbázist és CLI-t ez a modul nem ismer.
 */
import { PROFILE } from "./profile";

/** Csatolmány a levél nyelve szerint — a modell csak a nyelvet dönti el. */
export const LANGUAGE_ATTACHMENT: Record<string, string> = {
  hu: "kt_bemutatkozo.pdf",
  en: "kt_introduce.pdf",
};

export type ThreadReplyStatus =
  /** A küldő gép még nem írta meg a piszkozatot. */
  | "generalas"
  /** Megvan a piszkozat, jóváhagyásra vár. */
  | "atnezendo"
  /** Jóváhagyva: a fiók következő szabad helyén kimegy. */
  | "jovahagyva"
  /** Épp megy — ha itt ragad, a küldés megszakadt, és nem próbáljuk újra magától. */
  | "kuldes"
  | "kiment"
  /** Az időzítés óta új levél jött a szálban — nem ment ki. */
  | "megallt"
  | "hiba";

export const STATUS_LABELS: Record<ThreadReplyStatus, string> = {
  generalas: "piszkozat készül",
  atnezendo: "jóváhagyásra vár",
  jovahagyva: "időzítve",
  kuldes: "küldés közben megszakadt",
  kiment: "kiment",
  megallt: "megállt: új levél jött",
  hiba: "hiba",
};

/** Ezekből az állapotokból hagyható jóvá (újra) a levél. */
export const APPROVABLE: ThreadReplyStatus[] = ["atnezendo", "hiba", "kuldes"];

/** Ezekben az állapotokban írható át a szöveg és cserélhető a csatolmány. */
export const EDITABLE: ThreadReplyStatus[] = [
  "atnezendo",
  "jovahagyva",
  "hiba",
  "megallt",
  "kuldes",
];

/**
 * Robotcím, amire nincs értelme válaszolni. Szándékosan szűk: az `info@` és a
 * `hr@` élő postafiók, azokra megy a levél.
 */
export function isNoReply(address: string): boolean {
  const local = address.trim().toLowerCase().split("@")[0] ?? "";
  return (
    /^(mailer-daemon|postmaster|bounces?|notifications?)$/.test(local) ||
    /no[-_.]?reply|do[-_.]?not[-_.]?reply|dont[-_.]?reply/.test(local)
  );
}

/** `Re:` az eredeti tárgy elé, halmozás nélkül. */
export function replySubject(subject: string): string {
  const base = subject.replace(/^((re|vs|aw|fwd?|fw)\s*:\s*)+/i, "").trim();
  return base ? `Re: ${base}` : "Re:";
}

export interface DraftContext {
  company: string;
  /** Aki a levelet írta (a feladó megjelenített neve), ha ismert. */
  senderName: string | null;
  /** A levél, amire válaszolunk — idézett előzmény nélkül. */
  incoming: string;
}

/**
 * A piszkozat promptja. A modell a kapott levél nyelvén ír, és ha az nem
 * elutasítás, a szál tartalmához igazítja a mondanivalót.
 */
export function draftPrompt(context: DraftContext): string {
  return [
    `Egy álláskereső full stack fejlesztő (${PROFILE.name}) nevében írsz rövid választ egy cégtől kapott levélre, ugyanabba a levélszálba.`,
    "",
    `Cég: ${context.company}`,
    context.senderName ? `A levél írója: ${context.senderName}` : "",
    "",
    "A kapott levél:",
    '"""',
    context.incoming.slice(0, 4000),
    '"""',
    "",
    "Mit írj:",
    "- Ha a levél elutasítás (most nincs nyitott pozíció, másik jelöltet választottak, nem illik a profil): köszönd meg a visszajelzést, írd meg, hogy sajnálod, hogy most nincs lehetőség, és hogy ha a jövőben nyílik valami, szívesen veszed a megkeresésüket.",
    "- Ha nem elutasítás: a levél tartalmához illő, rövid, udvarias válasz ugyanebben a szellemben (köszönet, nyitottság a későbbi kapcsolatra). Ne ígérj és ne állíts semmit, ami a levélből nem következik.",
    "- Minden esetben írd meg egy mondatban, hogy csatolsz egy rövid dokumentumot magadról, amelyben kicsit részletesebben írsz a munkádról és arról, min dolgoztál eddig.",
    "",
    "Szabályok:",
    "- Azon a nyelven írj, amelyiken a kapott levél íródott.",
    "- 3–4 mondat a megszólítás és az aláírás között. Udvarias, formális (magyarul magázó) hang, mentegetőzés és hízelgés nélkül.",
    "- Ha ismert a levél írójának neve, őt szólítsd meg; különben a cég csapatát.",
    "- Ne találj ki tényeket (pozíció neve, időpont, korábbi beszélgetés), és ne hagyj kitöltendő helyet vagy szögletes zárójelet.",
    `- Az aláírás pontosan ez legyen, külön sorokban: a nyelvnek megfelelő elköszönés, alatta „${PROFILE.name}", alatta „${PROFILE.email} · ${PROFILE.phone}".`,
    "",
    'A válasz kizárólag ez a JSON: {"language": "<a levél nyelvének kétbetűs kódja>", "body": "<a teljes levél szövege, sortörésekkel>"}',
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n");
}

/** A modell válaszából a levél szövege; üres vagy kitöltetlen szöveg hibát dob. */
export function draftFrom(data: Record<string, unknown>): {
  body: string;
  language: string | null;
} {
  const body = typeof data.body === "string" ? data.body.trim() : "";
  if (!body) throw new Error("A modell üres levelet adott vissza.");
  if (/\[[^\]\n]{2,}\]/.test(body)) {
    throw new Error("A piszkozatban kitöltendő hely maradt — generáld újra.");
  }
  const language =
    typeof data.language === "string" && /^[a-z]{2}$/i.test(data.language)
      ? data.language.toLowerCase()
      : null;
  return { body, language };
}

/**
 * Ennyi időzített válasz fér még ki ma egy fiókból. A betervezett első levelek
 * elsőbbséget élveznek: a válasz csak a megmaradt helyet használja.
 *
 * `cap`: a fiók napi plafonja (`null` = nincs) · `planned`: a ma kiment és a
 * mára betervezett első levelek · `repliesSent`: a ma már kiment válaszok.
 */
export function roomToday(
  cap: number | null,
  planned: number,
  repliesSent: number,
): number {
  if (cap === null) return Infinity;
  return Math.max(0, cap - planned - repliesSent);
}
